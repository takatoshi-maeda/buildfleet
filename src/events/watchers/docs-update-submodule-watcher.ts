import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SystemEvent } from "../router.js";
import {
  DocsUpdateSubmoduleStateStore,
  type DocsUpdateSubmoduleState,
  type DocsUpdateSubmoduleStateStorePort,
} from "./docs-update-submodule-state-store.js";

export const DEFAULT_DOCS_UPDATE_SUBMODULE_PULL_INTERVAL_MS = 60_000;
const DEFAULT_DOCS_UPDATE_SUBMODULE_RELATIVE_PATH = path.join("docs", "spec");

export interface EventSink {
  publish(event: SystemEvent): Promise<void>;
}

interface WatcherLogger {
  emit(record: Record<string, unknown>): void;
}

export interface DocsUpdateSubmoduleGitClient {
  hasUncommittedChanges(): Promise<boolean>;
  getHeadSha(): Promise<string | null>;
  pullFfOnlyOriginMain(): Promise<void>;
}

export interface DocsUpdateSubmoduleWatcherOptions {
  sink: EventSink;
  repositoryRoot?: string;
  submoduleDir?: string;
  pullIntervalMs?: number;
  stateStore?: DocsUpdateSubmoduleStateStorePort;
  gitClient?: DocsUpdateSubmoduleGitClient;
  logger?: WatcherLogger;
}

export interface DocsUpdateSubmoduleResolvedPaths {
  repositoryRoot: string;
  submoduleDir: string;
  submodulePath: string;
}

export class DocsUpdateSubmoduleWatcher {
  private timer: NodeJS.Timeout | null = null;
  private tickInFlight = false;
  private state: DocsUpdateSubmoduleState | null = null;
  private readonly stateStore: DocsUpdateSubmoduleStateStorePort;
  private readonly gitClient: DocsUpdateSubmoduleGitClient;
  private readonly pullIntervalMs: number;
  private readonly logger: WatcherLogger;
  private readonly submodulePath: string;
  private readonly repositoryRoot: string;
  private readonly submoduleDir: string;

  constructor(options: DocsUpdateSubmoduleWatcherOptions) {
    const resolvedPaths = resolveDocsUpdateSubmodulePaths({
      repositoryRoot: options.repositoryRoot,
      submoduleDir: options.submoduleDir,
    });
    this.repositoryRoot = resolvedPaths.repositoryRoot;
    this.submoduleDir = resolvedPaths.submoduleDir;
    this.submodulePath = resolvedPaths.submodulePath;
    this.pullIntervalMs = options.pullIntervalMs ?? DEFAULT_DOCS_UPDATE_SUBMODULE_PULL_INTERVAL_MS;
    if (!Number.isFinite(this.pullIntervalMs) || this.pullIntervalMs <= 0) {
      throw new Error("docs update submodule pull interval must be positive");
    }
    this.stateStore = options.stateStore ?? new DocsUpdateSubmoduleStateStore();
    this.gitClient = options.gitClient ?? new ShellDocsUpdateSubmoduleGitClient(this.submoduleDir);
    this.logger = options.logger ?? { emit: () => undefined };
    this.sink = options.sink;
  }

  private readonly sink: EventSink;

  start(): void {
    if (this.timer) {
      return;
    }

    void this.poll();
    this.timer = setInterval(() => {
      void this.poll();
    }, this.pullIntervalMs);
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    if (this.tickInFlight) {
      return;
    }
    this.tickInFlight = true;
    try {
      await this.ensureStateLoaded();

      const hasUncommittedChanges = await this.gitClient.hasUncommittedChanges();
      if (hasUncommittedChanges) {
        this.log("warn", "fleet.docs-update-submodule.sync_skipped_dirty", {
          submodulePath: this.submodulePath,
        });
        return;
      }

      const beforeSha = await this.gitClient.getHeadSha();
      if (!beforeSha) {
        this.log("warn", "fleet.docs-update-submodule.sync_skipped_missing_head", {
          submodulePath: this.submodulePath,
        });
        return;
      }

      try {
        await this.gitClient.pullFfOnlyOriginMain();
      } catch (error) {
        this.log("warn", "fleet.docs-update-submodule.pull_failed", {
          submodulePath: this.submodulePath,
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      const afterSha = await this.gitClient.getHeadSha();
      if (!afterSha) {
        this.log("warn", "fleet.docs-update-submodule.sync_skipped_missing_head", {
          submodulePath: this.submodulePath,
        });
        return;
      }

      await this.saveObservedState(afterSha);
      const currentState = await this.getCurrentState();
      const isCommitUpdatedByPull = beforeSha !== afterSha;
      // Bootstrap rule: first poll should emit once even without pull movement so downstream
      // docs pipelines can initialize from the currently observed submodule commit.
      const isBootstrapWithoutPriorTrigger = beforeSha === afterSha && currentState.lastTriggeredSha === null;
      if (!isCommitUpdatedByPull && !isBootstrapWithoutPriorTrigger) {
        return;
      }
      if (currentState.lastTriggeredSha === afterSha) {
        return;
      }

      await this.sink.publish({ type: "docs.update", paths: [this.submodulePath] });
      await this.saveTriggeredState(afterSha);
      this.log("info", "fleet.docs-update-submodule.docs_update_enqueued", {
        submodulePath: this.submodulePath,
        beforeSha,
        afterSha,
      });
    } catch (error) {
      this.log("warn", "fleet.docs-update-submodule.sync_failed", {
        submodulePath: this.submodulePath,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.tickInFlight = false;
    }
  }

  private async ensureStateLoaded(): Promise<void> {
    if (this.state !== null) {
      return;
    }
    try {
      const loaded = await this.stateStore.load();
      if (loaded && loaded.submodulePath === this.submodulePath) {
        this.state = loaded;
        return;
      }
      if (loaded && loaded.submodulePath !== this.submodulePath) {
        this.log("warn", "fleet.docs-update-submodule.state_path_mismatch", {
          expectedSubmodulePath: this.submodulePath,
          actualSubmodulePath: loaded.submodulePath,
        });
      }
    } catch (error) {
      this.log("warn", "fleet.docs-update-submodule.state_load_failed", {
        submodulePath: this.submodulePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    this.state = {
      submodulePath: this.submodulePath,
      lastObservedSha: null,
      lastTriggeredSha: null,
      previousTriggeredSha: null,
      lastTriggeredAt: null,
      updatedAt: new Date().toISOString(),
    };
  }

  private async saveObservedState(lastObservedSha: string): Promise<void> {
    const nextState = {
      ...(await this.getCurrentState()),
      lastObservedSha,
      updatedAt: new Date().toISOString(),
    };
    this.state = nextState;
    await this.stateStore.save(nextState);
  }

  private async saveTriggeredState(lastTriggeredSha: string): Promise<void> {
    const current = await this.getCurrentState();
    const now = new Date().toISOString();
    const nextState: DocsUpdateSubmoduleState = {
      ...current,
      previousTriggeredSha: current.lastTriggeredSha,
      lastTriggeredSha,
      lastTriggeredAt: now,
      updatedAt: now,
    };
    this.state = nextState;
    await this.stateStore.save(nextState);
  }

  private async getCurrentState(): Promise<DocsUpdateSubmoduleState> {
    await this.ensureStateLoaded();
    if (!this.state) {
      throw new Error("docs update submodule state is not initialized");
    }
    return this.state;
  }

  private log(level: "info" | "warn", event: string, detail: Record<string, unknown>): void {
    this.logger.emit({
      ts: new Date().toISOString(),
      level,
      event,
      repositoryRoot: this.repositoryRoot,
      submoduleDir: this.submoduleDir,
      ...detail,
    });
  }
}

export function resolveDocsUpdateSubmodulePaths(input: {
  repositoryRoot?: string;
  submoduleDir?: string;
}): DocsUpdateSubmoduleResolvedPaths {
  const repositoryRoot = path.resolve(input.repositoryRoot ?? process.cwd());
  const submoduleDir = path.resolve(input.submoduleDir ?? path.join(repositoryRoot, DEFAULT_DOCS_UPDATE_SUBMODULE_RELATIVE_PATH));
  const relative = path.relative(repositoryRoot, submoduleDir);
  if (relative.length === 0 || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("docs update submodule directory must be inside the current working directory");
  }
  const submodulePath = normalizeToPosixPath(relative);
  return {
    repositoryRoot,
    submoduleDir,
    submodulePath,
  };
}

export async function assertDocsUpdateSubmoduleIsValid(input: {
  repositoryRoot?: string;
  submoduleDir?: string;
}): Promise<DocsUpdateSubmoduleResolvedPaths> {
  const resolved = resolveDocsUpdateSubmodulePaths(input);

  const stat = await fs.stat(resolved.submoduleDir).catch((error) => {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      throw new Error(`${resolved.submodulePath} does not exist`);
    }
    throw error;
  });
  if (!stat.isDirectory()) {
    throw new Error(`${resolved.submodulePath} is not a directory`);
  }

  const submodulePaths = await listSubmodulePaths(resolved.repositoryRoot);
  if (!submodulePaths.has(resolved.submodulePath)) {
    throw new Error(`${resolved.submodulePath} is not registered as a submodule in .gitmodules`);
  }

  let insideWorkTree = "";
  try {
    insideWorkTree = await runGitCommand(["rev-parse", "--is-inside-work-tree"], { cwd: resolved.submoduleDir });
  } catch {
    throw new Error(`${resolved.submodulePath} is not a git working tree`);
  }
  if (insideWorkTree.trim() !== "true") {
    throw new Error(`${resolved.submodulePath} is not a git working tree`);
  }

  return resolved;
}

async function listSubmodulePaths(repositoryRoot: string): Promise<Set<string>> {
  let stdout = "";
  try {
    stdout = await runGitCommand(
      ["config", "-f", ".gitmodules", "--get-regexp", "^submodule\\..*\\.path$"],
      { cwd: repositoryRoot },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("exit 1")) {
      return new Set<string>();
    }
    throw error;
  }
  const paths = new Set<string>();
  for (const line of stdout.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const fragments = trimmed.split(/\s+/u);
    if (fragments.length < 2) {
      continue;
    }
    paths.add(normalizeToPosixPath(fragments.slice(1).join(" ")));
  }
  return paths;
}

class ShellDocsUpdateSubmoduleGitClient implements DocsUpdateSubmoduleGitClient {
  constructor(private readonly submoduleDir: string) {}

  async hasUncommittedChanges(): Promise<boolean> {
    const stdout = await runGitCommand(["status", "--porcelain"], { cwd: this.submoduleDir });
    return stdout.trim().length > 0;
  }

  async getHeadSha(): Promise<string | null> {
    const stdout = await runGitCommand(["rev-parse", "HEAD"], { cwd: this.submoduleDir });
    const sha = stdout.trim();
    return sha.length > 0 ? sha : null;
  }

  async pullFfOnlyOriginMain(): Promise<void> {
    await runGitCommand(["pull", "--ff-only", "origin", "main"], { cwd: this.submoduleDir });
  }
}

async function runGitCommand(args: string[], input: { cwd: string }): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      const suffix = stderr.trim().length > 0 ? `: ${stderr.trim()}` : "";
      reject(new Error(`git ${args.join(" ")} failed (exit ${code ?? "unknown"})${suffix}`));
    });
  });
}

function normalizeToPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
