import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runFleetStartupAutoRecovery } from "../src/cli/commands/fleetctl.js";

describe("runFleetStartupAutoRecovery", () => {
  it("enqueues backlog.epic.ready for in-progress epic", async () => {
    const queueService = {
      enqueueToRunningAgents: vi.fn().mockResolvedValue({ enqueuedAgentIds: ["developer-1"] }),
    };

    await runFleetStartupAutoRecovery({
      backlogService: {
        list: async () => ({
          epics: [{ id: "E-001", status: "in-progress" }],
        }),
      },
      queueService,
      emit: vi.fn(),
    });

    expect(queueService.enqueueToRunningAgents).toHaveBeenCalledTimes(1);
    expect(queueService.enqueueToRunningAgents).toHaveBeenCalledWith({
      type: "backlog.epic.ready",
      epicId: "E-001",
    });
  });

  it("enqueues backlog.epic.polish.ready for in-review epic when no failed queue hints exist", async () => {
    const queueService = {
      enqueueToRunningAgents: vi.fn().mockResolvedValue({ enqueuedAgentIds: ["polisher-1"] }),
    };
    const emit = vi.fn();

    await runFleetStartupAutoRecovery(
      {
        backlogService: {
          list: async () => ({
            epics: [{ id: "E-001", status: "in-review" }],
          }),
        },
        queueService,
        emit,
      },
      path.join(os.tmpdir(), "codefleet-no-runtime"),
    );

    expect(queueService.enqueueToRunningAgents).toHaveBeenCalledTimes(1);
    expect(queueService.enqueueToRunningAgents).toHaveBeenCalledWith({
      type: "backlog.epic.polish.ready",
      epicId: "E-001",
    });
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "fleet.startup.auto_recovery.enqueued",
        epicId: "E-001",
        recoveredEventType: "backlog.epic.polish.ready",
      }),
    );
  });

  it("prefers backlog.epic.review.ready when latest failed event for epic is review", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-auto-recovery-"));
    const failedDir = path.join(tempDir, "events", "agents", "reviewer-1", "failed");
    await fs.mkdir(failedDir, { recursive: true });
    await fs.writeFile(
      path.join(failedDir, "01.json"),
      JSON.stringify({
        id: "01",
        createdAt: "2026-02-26T11:55:00.000Z",
        event: {
          type: "backlog.epic.review.ready",
          epicId: "E-001",
        },
      }),
      "utf8",
    );

    const queueService = {
      enqueueToRunningAgents: vi.fn().mockResolvedValue({ enqueuedAgentIds: ["reviewer-1"] }),
    };

    await runFleetStartupAutoRecovery(
      {
        backlogService: {
          list: async () => ({
            epics: [{ id: "E-001", status: "in-review" }],
          }),
        },
        queueService,
        emit: vi.fn(),
      },
      tempDir,
    );

    expect(queueService.enqueueToRunningAgents).toHaveBeenCalledTimes(1);
    expect(queueService.enqueueToRunningAgents).toHaveBeenCalledWith({
      type: "backlog.epic.review.ready",
      epicId: "E-001",
    });
  });

  it("uses review event when polishing previously completed for the epic", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-auto-recovery-"));
    const doneDir = path.join(tempDir, "events", "agents", "polisher-1", "done");
    await fs.mkdir(doneDir, { recursive: true });
    await fs.writeFile(
      path.join(doneDir, "01.json"),
      JSON.stringify({
        id: "01",
        createdAt: "2026-02-26T11:55:00.000Z",
        event: {
          type: "backlog.epic.polish.ready",
          epicId: "E-001",
        },
      }),
      "utf8",
    );

    const queueService = {
      enqueueToRunningAgents: vi.fn().mockResolvedValue({ enqueuedAgentIds: ["reviewer-1"] }),
    };

    await runFleetStartupAutoRecovery(
      {
        backlogService: {
          list: async () => ({
            epics: [{ id: "E-001", status: "in-review" }],
          }),
        },
        queueService,
        emit: vi.fn(),
      },
      tempDir,
    );

    expect(queueService.enqueueToRunningAgents).toHaveBeenCalledTimes(1);
    expect(queueService.enqueueToRunningAgents).toHaveBeenCalledWith({
      type: "backlog.epic.review.ready",
      epicId: "E-001",
    });
  });

  it("does nothing when no recoverable epics exist", async () => {
    const queueService = {
      enqueueToRunningAgents: vi.fn(),
    };

    await runFleetStartupAutoRecovery({
      backlogService: {
        list: async () => ({
          epics: [{ id: "E-001", status: "done" }],
        }),
      },
      queueService,
      emit: vi.fn(),
    });

    expect(queueService.enqueueToRunningAgents).not.toHaveBeenCalled();
  });
});
