import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DocsUpdateSubmoduleStateStore } from "../src/events/watchers/docs-update-submodule-state-store.js";

describe("DocsUpdateSubmoduleStateStore", () => {
  it("saves and loads state via runtime file", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-docs-submodule-state-"));
    const runtimeDir = path.join(tempDir, ".codefleet", "runtime");
    const store = new DocsUpdateSubmoduleStateStore(runtimeDir);
    const now = new Date().toISOString();

    await store.save({
      submodulePath: "docs/spec",
      lastObservedSha: "a1",
      lastTriggeredSha: "a1",
      previousTriggeredSha: "z9",
      lastTriggeredAt: now,
      updatedAt: now,
    });

    const loaded = await store.load();
    expect(loaded).toEqual({
      submodulePath: "docs/spec",
      lastObservedSha: "a1",
      lastTriggeredSha: "a1",
      previousTriggeredSha: "z9",
      lastTriggeredAt: now,
      updatedAt: now,
    });
  });

  it("returns null when state file does not exist", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-docs-submodule-state-empty-"));
    const runtimeDir = path.join(tempDir, ".codefleet", "runtime");
    const store = new DocsUpdateSubmoduleStateStore(runtimeDir);

    await expect(store.load()).resolves.toBeNull();
  });

  it("throws when state json is broken", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-docs-submodule-state-invalid-"));
    const runtimeDir = path.join(tempDir, ".codefleet", "runtime");
    await fs.mkdir(runtimeDir, { recursive: true });
    await fs.writeFile(path.join(runtimeDir, "docs-update-submodule-state.json"), "{broken", "utf8");

    const store = new DocsUpdateSubmoduleStateStore(runtimeDir);
    await expect(store.load()).rejects.toThrow(/invalid docs-update-submodule state JSON/u);
  });
});
