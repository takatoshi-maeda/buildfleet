import { promises as fs } from "node:fs";
import path from "node:path";
import { atomicWriteJson } from "../../infra/fs/atomic-write.js";

const DEFAULT_RUNTIME_DIR = path.join(".codefleet", "runtime");
const DEFAULT_STATE_FILE_NAME = "docs-update-submodule-state.json";

export interface DocsUpdateSubmoduleState {
  submodulePath: string;
  lastObservedSha: string | null;
  lastTriggeredSha: string | null;
  previousTriggeredSha: string | null;
  lastTriggeredAt: string | null;
  updatedAt: string;
}

export interface DocsUpdateSubmoduleStateStorePort {
  load(): Promise<DocsUpdateSubmoduleState | null>;
  save(state: DocsUpdateSubmoduleState): Promise<void>;
}

export class DocsUpdateSubmoduleStateStore implements DocsUpdateSubmoduleStateStorePort {
  constructor(private readonly runtimeDir: string = DEFAULT_RUNTIME_DIR) {}

  async load(): Promise<DocsUpdateSubmoduleState | null> {
    const statePath = this.getStateFilePath();
    let raw = "";
    try {
      raw = await fs.readFile(statePath, "utf8");
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return null;
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`invalid docs-update-submodule state JSON: ${statePath}`);
    }
    return parseDocsUpdateSubmoduleState(parsed, statePath);
  }

  async save(state: DocsUpdateSubmoduleState): Promise<void> {
    await atomicWriteJson(this.getStateFilePath(), state);
  }

  private getStateFilePath(): string {
    return path.join(this.runtimeDir, DEFAULT_STATE_FILE_NAME);
  }
}

function parseDocsUpdateSubmoduleState(input: unknown, sourcePath: string): DocsUpdateSubmoduleState {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`invalid docs-update-submodule state object: ${sourcePath}`);
  }

  const state = input as Record<string, unknown>;
  const submodulePath = typeof state.submodulePath === "string" ? state.submodulePath.trim() : "";
  if (submodulePath.length === 0) {
    throw new Error(`invalid docs-update-submodule state submodulePath: ${sourcePath}`);
  }

  const lastObservedSha = parseNullableString(state.lastObservedSha, "lastObservedSha", sourcePath);
  const lastTriggeredSha = parseNullableString(state.lastTriggeredSha, "lastTriggeredSha", sourcePath);
  const previousTriggeredSha = parseNullableString(state.previousTriggeredSha, "previousTriggeredSha", sourcePath);
  const lastTriggeredAt = parseNullableString(state.lastTriggeredAt, "lastTriggeredAt", sourcePath);
  const updatedAt = typeof state.updatedAt === "string" ? state.updatedAt : "";
  if (updatedAt.length === 0) {
    throw new Error(`invalid docs-update-submodule state updatedAt: ${sourcePath}`);
  }

  return {
    submodulePath,
    lastObservedSha,
    lastTriggeredSha,
    previousTriggeredSha,
    lastTriggeredAt,
    updatedAt,
  };
}

function parseNullableString(value: unknown, fieldName: string, sourcePath: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`invalid docs-update-submodule state ${fieldName}: ${sourcePath}`);
  }
  return value;
}
