import { promises as fs } from "node:fs";
import path from "node:path";
import type { BacklogService } from "./backlog-service.js";

const DEFAULT_BACKLOG_DIR = ".codefleet/data/backlog";
const CHANGE_LOG_FILE = "change-logs.jsonl";
const DEFAULT_WATCH_POLL_MS = 1_000;

interface BacklogSnapshot {
  updatedAt: string;
  version: number;
  epics: unknown[];
  items: unknown[];
  questions: unknown[];
}

interface BacklogChangeLogEntry {
  id: string;
  operation: string;
  reason: string;
  createdAt: string;
  itemsJsonVersion: number;
  targetType?: "epic" | "item" | "question";
  targetId?: string;
  targets?: Array<{ type: "epic" | "item" | "question"; id: string }>;
}

export interface BacklogWatchResult {
  startedAt: string;
  endedAt: string;
  eventCount: number;
  reason: "timeout" | "client_closed" | "server_shutdown";
}

export interface BacklogWatchEvent {
  type: "backlog.snapshot" | "backlog.changed" | "backlog.heartbeat" | "backlog.complete";
  payload: Record<string, unknown>;
}

export interface BacklogWatchInput {
  includeSnapshot: boolean;
  heartbeatSec: number;
  maxDurationSec?: number;
  notificationToken?: string;
  signal?: AbortSignal;
  onEvent?: (event: BacklogWatchEvent) => Promise<void>;
}

export class BacklogObservabilityService {
  private readonly changeLogPath: string;

  constructor(
    private readonly backlogService: Pick<BacklogService, "list">,
    backlogDir: string = DEFAULT_BACKLOG_DIR,
  ) {
    this.changeLogPath = path.join(backlogDir, CHANGE_LOG_FILE);
  }

  async watchBacklog(input: BacklogWatchInput): Promise<BacklogWatchResult> {
    const startedAt = new Date().toISOString();
    let eventCount = 0;
    let cursor = await this.readChangeLogOffset();

    if (input.includeSnapshot) {
      const snapshot = await this.readSnapshot();
      await emitEvent(input.onEvent, {
        type: "backlog.snapshot",
        payload: withToken(
          {
            updatedAt: snapshot.updatedAt,
            version: snapshot.version,
            counts: {
              epics: snapshot.epics.length,
              items: snapshot.items.length,
              questions: snapshot.questions.length,
            },
          },
          input.notificationToken,
        ),
      });
      eventCount += 1;
    }

    const timeoutAt = Number.isInteger(input.maxDurationSec)
      ? Date.now() + (input.maxDurationSec as number) * 1_000
      : null;
    let lastHeartbeatAt = Date.now();
    while (!input.signal?.aborted && (timeoutAt === null || Date.now() < timeoutAt)) {
      await sleep(DEFAULT_WATCH_POLL_MS, input.signal);
      const changeLogState = await this.readChangeLogFrom(cursor);
      cursor = changeLogState.nextOffset;
      for (const line of changeLogState.lines) {
        const entry = parseChangeLogEntry(line);
        if (!entry) {
          continue;
        }
        await emitEvent(input.onEvent, {
          type: "backlog.changed",
          payload: withToken(
            {
              updatedAt: entry.createdAt,
              version: entry.itemsJsonVersion,
              changeId: entry.id,
              operation: entry.operation,
              reason: entry.reason,
              itemsJsonVersion: entry.itemsJsonVersion,
              ...(entry.targetType && entry.targetId
                ? {
                    targetType: entry.targetType,
                    targetId: entry.targetId,
                  }
                : {}),
              ...(entry.targets && entry.targets.length > 0 ? { targets: entry.targets } : {}),
            },
            input.notificationToken,
          ),
        });
        eventCount += 1;
      }

      if (Date.now() - lastHeartbeatAt >= input.heartbeatSec * 1_000) {
        await emitEvent(input.onEvent, {
          type: "backlog.heartbeat",
          payload: withToken({ updatedAt: new Date().toISOString() }, input.notificationToken),
        });
        eventCount += 1;
        lastHeartbeatAt = Date.now();
      }
    }

    const endedAt = new Date().toISOString();
    const reason: BacklogWatchResult["reason"] = input.signal?.aborted ? "client_closed" : "timeout";
    await emitEvent(input.onEvent, {
      type: "backlog.complete",
      payload: withToken(
        {
          eventCount,
          reason,
        },
        input.notificationToken,
      ),
    });
    eventCount += 1;

    return {
      startedAt,
      endedAt,
      eventCount,
      reason,
    };
  }

  private async readSnapshot(): Promise<BacklogSnapshot> {
    const snapshot = await this.backlogService.list({ includeHidden: true });
    return {
      updatedAt: snapshot.updatedAt,
      version: snapshot.version,
      epics: snapshot.epics,
      items: snapshot.items,
      questions: snapshot.questions ?? [],
    };
  }

  private async readChangeLogOffset(): Promise<number> {
    const lines = await readChangeLogLines(this.changeLogPath);
    return lines.length;
  }

  private async readChangeLogFrom(offset: number): Promise<{ lines: string[]; nextOffset: number }> {
    const lines = await readChangeLogLines(this.changeLogPath);
    const nextOffset = lines.length;
    if (nextOffset < offset) {
      return { lines, nextOffset };
    }
    return {
      lines: lines.slice(offset),
      nextOffset,
    };
  }
}

async function readChangeLogLines(changeLogPath: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(changeLogPath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function parseChangeLogEntry(line: string): BacklogChangeLogEntry | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const entry = parsed as {
    id?: unknown;
    operation?: unknown;
    reason?: unknown;
    createdAt?: unknown;
    itemsJsonVersion?: unknown;
    targetType?: unknown;
    targetId?: unknown;
    targets?: unknown;
  };
  if (
    typeof entry.id !== "string" ||
    typeof entry.operation !== "string" ||
    typeof entry.reason !== "string" ||
    typeof entry.createdAt !== "string" ||
    typeof entry.itemsJsonVersion !== "number"
  ) {
    return null;
  }

  return {
    id: entry.id,
    operation: entry.operation,
    reason: entry.reason,
    createdAt: entry.createdAt,
    itemsJsonVersion: entry.itemsJsonVersion,
    ...(isChangeTargetType(entry.targetType) && typeof entry.targetId === "string"
      ? {
          targetType: entry.targetType,
          targetId: entry.targetId,
        }
      : {}),
    ...(Array.isArray(entry.targets) ? { targets: parseChangeTargets(entry.targets) } : {}),
  };
}

function isChangeTargetType(value: unknown): value is "epic" | "item" | "question" {
  return value === "epic" || value === "item" || value === "question";
}

function parseChangeTargets(value: unknown[]): Array<{ type: "epic" | "item" | "question"; id: string }> {
  const targets: Array<{ type: "epic" | "item" | "question"; id: string }> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const target = entry as { type?: unknown; id?: unknown };
    if (!isChangeTargetType(target.type) || typeof target.id !== "string" || target.id.trim().length === 0) {
      continue;
    }
    targets.push({ type: target.type, id: target.id });
  }
  return targets;
}

function withToken(payload: Record<string, unknown>, token: string | undefined): Record<string, unknown> {
  if (!token) {
    return payload;
  }
  return {
    ...payload,
    notificationToken: token,
  };
}

async function emitEvent<T extends { payload: Record<string, unknown> }>(
  emitter: ((event: T) => Promise<void>) | undefined,
  event: T,
): Promise<void> {
  if (!emitter) {
    return;
  }
  await emitter(event);
}

function sleep(durationMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, durationMs);
    if (!signal) {
      return;
    }
    const onAbort = () => {
      clearTimeout(timeout);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
