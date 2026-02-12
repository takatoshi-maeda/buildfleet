import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AgentEventQueueWorkerService } from "../src/domain/events/agent-event-queue-worker-service.js";

describe("AgentEventQueueWorkerService", () => {
  it("moves valid pending messages to done and invalid messages to failed", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-event-worker-"));
    const runtimeDir = path.join(tempDir, ".codefleet", "runtime");
    const pendingDir = path.join(runtimeDir, "events", "agents", "developer-1", "pending");
    await fs.mkdir(pendingDir, { recursive: true });

    await fs.writeFile(
      path.join(pendingDir, "001-valid.json"),
      `${JSON.stringify({ id: "1", event: { type: "docs.update", paths: ["docs/a.md"] } })}\n`,
      "utf8",
    );
    await fs.writeFile(path.join(pendingDir, "002-invalid.json"), "not-json\n", "utf8");

    const service = new AgentEventQueueWorkerService(runtimeDir);
    const result = await service.consume({ agentId: "developer-1", maxMessages: 10 });

    expect(result.consumed).toBe(2);
    expect(result.doneFiles).toHaveLength(1);
    expect(result.failedFiles).toHaveLength(1);

    await expect(fs.stat(result.doneFiles[0])).resolves.toBeDefined();
    await expect(fs.stat(result.failedFiles[0])).resolves.toBeDefined();
  });
});
