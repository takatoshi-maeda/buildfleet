import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertDocsUpdateSubmoduleIsValid,
  DocsUpdateSubmoduleWatcher,
  resolveDocsUpdateSubmodulePaths,
  type DocsUpdateSubmoduleGitClient,
} from "../src/events/watchers/docs-update-submodule-watcher.js";
import type { DocsUpdateSubmoduleState, DocsUpdateSubmoduleStateStorePort } from "../src/events/watchers/docs-update-submodule-state-store.js";
import type { SystemEvent } from "../src/events/router.js";

class RecordingSink {
  public events: SystemEvent[] = [];

  async publish(event: SystemEvent): Promise<void> {
    this.events.push(event);
  }
}

class MemoryStateStore implements DocsUpdateSubmoduleStateStorePort {
  constructor(private state: DocsUpdateSubmoduleState | null = null) {}

  async load(): Promise<DocsUpdateSubmoduleState | null> {
    return this.state;
  }

  async save(state: DocsUpdateSubmoduleState): Promise<void> {
    this.state = state;
  }

  getSnapshot(): DocsUpdateSubmoduleState | null {
    return this.state;
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("DocsUpdateSubmoduleWatcher", () => {
  it("resolves default submodule dir to {cwd}/docs/spec", () => {
    const cwd = path.join("/tmp", "fleet-repo");
    const resolved = resolveDocsUpdateSubmodulePaths({ repositoryRoot: cwd });
    expect(resolved.submoduleDir).toBe(path.join(cwd, "docs", "spec"));
    expect(resolved.submodulePath).toBe("docs/spec");
  });

  it("fails fast when target path is not listed in .gitmodules", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-docs-submodule-validate-"));
    const docsSpecDir = path.join(tempDir, "docs", "spec");
    await fs.mkdir(docsSpecDir, { recursive: true });
    await fs.writeFile(
      path.join(tempDir, ".gitmodules"),
      [
        '[submodule "vendor/ai-kit"]',
        "path = vendor/ai-kit",
        "url = https://example.invalid/ai-kit.git",
        "",
      ].join("\n"),
      "utf8",
    );

    await expect(
      assertDocsUpdateSubmoduleIsValid({
        repositoryRoot: tempDir,
        submoduleDir: docsSpecDir,
      }),
    ).rejects.toThrow(/is not registered as a submodule/u);
  });

  it("skips pull and docs.update when submodule has uncommitted changes", async () => {
    const sink = new RecordingSink();
    const pullSpy = vi.fn();
    const store = new MemoryStateStore();
    const gitClient: DocsUpdateSubmoduleGitClient = {
      hasUncommittedChanges: async () => true,
      getHeadSha: async () => "sha-before",
      pullFfOnlyOriginMain: async () => {
        pullSpy();
      },
    };

    const watcher = new DocsUpdateSubmoduleWatcher({
      repositoryRoot: process.cwd(),
      submoduleDir: path.join(process.cwd(), "docs", "spec"),
      pullIntervalMs: 10_000,
      sink,
      stateStore: store,
      gitClient,
    });
    watcher.start();
    await sleep(40);
    watcher.stop();

    expect(pullSpy).not.toHaveBeenCalled();
    expect(sink.events).toEqual([]);
  });

  it("publishes docs.update when commit sha changes after pull", async () => {
    const sink = new RecordingSink();
    const store = new MemoryStateStore();
    const state = { sha: "sha-before" };
    const gitClient: DocsUpdateSubmoduleGitClient = {
      hasUncommittedChanges: async () => false,
      getHeadSha: async () => state.sha,
      pullFfOnlyOriginMain: async () => {
        state.sha = "sha-after";
      },
    };

    const watcher = new DocsUpdateSubmoduleWatcher({
      repositoryRoot: process.cwd(),
      submoduleDir: path.join(process.cwd(), "docs", "spec"),
      pullIntervalMs: 10_000,
      sink,
      stateStore: store,
      gitClient,
    });
    watcher.start();
    await sleep(40);
    watcher.stop();

    expect(sink.events).toEqual([{ type: "docs.update", paths: ["docs/spec"] }]);
  });

  it("publishes docs.update once on bootstrap when there is no prior trigger", async () => {
    const sink = new RecordingSink();
    const store = new MemoryStateStore({
      submodulePath: "docs/spec",
      lastObservedSha: null,
      lastTriggeredSha: null,
      previousTriggeredSha: null,
      lastTriggeredAt: null,
      updatedAt: new Date().toISOString(),
    });
    const gitClient: DocsUpdateSubmoduleGitClient = {
      hasUncommittedChanges: async () => false,
      getHeadSha: async () => "sha-stable",
      pullFfOnlyOriginMain: async () => undefined,
    };

    const watcher = new DocsUpdateSubmoduleWatcher({
      repositoryRoot: process.cwd(),
      submoduleDir: path.join(process.cwd(), "docs", "spec"),
      pullIntervalMs: 10_000,
      sink,
      stateStore: store,
      gitClient,
    });
    watcher.start();
    await sleep(40);
    watcher.stop();

    expect(sink.events).toEqual([{ type: "docs.update", paths: ["docs/spec"] }]);
    const saved = store.getSnapshot();
    expect(saved?.lastTriggeredSha).toBe("sha-stable");
    expect(saved?.lastObservedSha).toBe("sha-stable");
  });

  it("does not publish when pull fails", async () => {
    const sink = new RecordingSink();
    const store = new MemoryStateStore();
    const gitClient: DocsUpdateSubmoduleGitClient = {
      hasUncommittedChanges: async () => false,
      getHeadSha: async () => "sha-before",
      pullFfOnlyOriginMain: async () => {
        throw new Error("network failed");
      },
    };

    const watcher = new DocsUpdateSubmoduleWatcher({
      repositoryRoot: process.cwd(),
      submoduleDir: path.join(process.cwd(), "docs", "spec"),
      pullIntervalMs: 10_000,
      sink,
      stateStore: store,
      gitClient,
    });
    watcher.start();
    await sleep(40);
    watcher.stop();

    expect(sink.events).toEqual([]);
  });

  it("suppresses duplicate publish when restored state already has the same lastTriggeredSha", async () => {
    const sink = new RecordingSink();
    const store = new MemoryStateStore({
      submodulePath: "docs/spec",
      lastObservedSha: "sha-before",
      lastTriggeredSha: "sha-after",
      previousTriggeredSha: "sha-older",
      lastTriggeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const state = { sha: "sha-before" };
    const gitClient: DocsUpdateSubmoduleGitClient = {
      hasUncommittedChanges: async () => false,
      getHeadSha: async () => state.sha,
      pullFfOnlyOriginMain: async () => {
        state.sha = "sha-after";
      },
    };

    const watcher = new DocsUpdateSubmoduleWatcher({
      repositoryRoot: process.cwd(),
      submoduleDir: path.join(process.cwd(), "docs", "spec"),
      pullIntervalMs: 10_000,
      sink,
      stateStore: store,
      gitClient,
    });
    watcher.start();
    await sleep(40);
    watcher.stop();

    expect(sink.events).toEqual([]);
  });

  it("updates previousTriggeredSha when newer commits are triggered", async () => {
    const sink = new RecordingSink();
    const store = new MemoryStateStore({
      submodulePath: "docs/spec",
      lastObservedSha: "sha-1",
      lastTriggeredSha: "sha-1",
      previousTriggeredSha: null,
      lastTriggeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const state = { sha: "sha-1" };
    let pullCount = 0;
    const gitClient: DocsUpdateSubmoduleGitClient = {
      hasUncommittedChanges: async () => false,
      getHeadSha: async () => state.sha,
      pullFfOnlyOriginMain: async () => {
        pullCount += 1;
        if (pullCount === 1) {
          state.sha = "sha-2";
        } else if (pullCount === 2) {
          state.sha = "sha-3";
        }
      },
    };

    const watcher = new DocsUpdateSubmoduleWatcher({
      repositoryRoot: process.cwd(),
      submoduleDir: path.join(process.cwd(), "docs", "spec"),
      pullIntervalMs: 10,
      sink,
      stateStore: store,
      gitClient,
    });
    watcher.start();
    await sleep(80);
    watcher.stop();

    const saved = store.getSnapshot();
    expect(saved?.lastTriggeredSha).toBe("sha-3");
    expect(saved?.previousTriggeredSha).toBe("sha-2");
  });
});
