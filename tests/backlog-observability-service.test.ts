import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BacklogService } from "../src/domain/backlog/backlog-service.js";
import {
  BacklogObservabilityService,
  type BacklogWatchEvent,
} from "../src/domain/backlog/backlog-observability-service.js";

describe("BacklogObservabilityService", () => {
  it("emits backlog.snapshot and backlog.complete", async () => {
    const fixture = await createBacklogFixture();
    await fixture.backlogService.addEpic({ title: "epic-1", acceptanceTestIds: [] });
    const epic = await fixture.backlogService.readEpic({ id: "E-001" });
    await fixture.backlogService.addItem({ epicId: epic.id, title: "item-1", acceptanceTestIds: [] });
    await fixture.backlogService.addQuestion({ title: "question-1" });

    const events: BacklogWatchEvent[] = [];
    const result = await fixture.observability.watchBacklog({
      includeSnapshot: true,
      heartbeatSec: 1,
      maxDurationSec: 1,
      onEvent: async (event) => {
        events.push(event);
      },
    });

    expect(result.reason).toBe("timeout");
    expect(events[0]?.type).toBe("backlog.snapshot");
    expect(events[0]?.payload.counts).toEqual({ epics: 1, items: 1, questions: 1 });
    const complete = events.find((event) => event.type === "backlog.complete");
    expect(complete?.payload.reason).toBe("timeout");
  });

  it("emits backlog.changed when change-log is appended", async () => {
    const fixture = await createBacklogFixture();
    const events: BacklogWatchEvent[] = [];

    const watchPromise = fixture.observability.watchBacklog({
      includeSnapshot: false,
      heartbeatSec: 60,
      maxDurationSec: 2,
      onEvent: async (event) => {
        events.push(event);
      },
    });

    await sleep(200);
    await fixture.backlogService.addEpic({ title: "new epic", acceptanceTestIds: [] });
    await watchPromise;

    const changed = events.find((event) => event.type === "backlog.changed");
    expect(changed?.payload.operation).toBe("epic.add");
    expect(changed?.payload.itemsJsonVersion).toBe(1);
    expect(typeof changed?.payload.changeId).toBe("string");
    expect(changed?.payload.targetType).toBe("epic");
    expect(changed?.payload.targetId).toBe("E-001");
    expect(changed?.payload.targets).toEqual([{ type: "epic", id: "E-001" }]);
  });

  it("includes epic target in backlog.changed for claim-ready-for-implementation", async () => {
    const fixture = await createBacklogFixture();
    const events: BacklogWatchEvent[] = [];

    await fixture.backlogService.addEpic({ title: "claim me", acceptanceTestIds: [] });

    const watchPromise = fixture.observability.watchBacklog({
      includeSnapshot: false,
      heartbeatSec: 60,
      maxDurationSec: 2,
      onEvent: async (event) => {
        events.push(event);
      },
    });

    await sleep(200);
    await fixture.backlogService.claimReadyEpicForImplementation("developer-1");
    await watchPromise;

    const changed = events.find(
      (event) => event.type === "backlog.changed" && event.payload.operation === "epic.claim-ready-for-implementation",
    );
    expect(changed?.payload.targetType).toBe("epic");
    expect(changed?.payload.targetId).toBe("E-001");
    expect(changed?.payload.targets).toEqual([{ type: "epic", id: "E-001" }]);
  });

  it("emits backlog.heartbeat and backlog.complete during watch", async () => {
    const fixture = await createBacklogFixture();
    const events: BacklogWatchEvent[] = [];

    await fixture.observability.watchBacklog({
      includeSnapshot: false,
      heartbeatSec: 1,
      maxDurationSec: 2,
      onEvent: async (event) => {
        events.push(event);
      },
    });

    expect(events.some((event) => event.type === "backlog.heartbeat")).toBe(true);
    expect(events.some((event) => event.type === "backlog.complete")).toBe(true);
  });

  it("stops watch as client_closed when abort signal is triggered", async () => {
    const fixture = await createBacklogFixture();
    const controller = new AbortController();
    const events: BacklogWatchEvent[] = [];

    const watchPromise = fixture.observability.watchBacklog({
      includeSnapshot: false,
      heartbeatSec: 60,
      signal: controller.signal,
      onEvent: async (event) => {
        events.push(event);
      },
    });

    await sleep(100);
    controller.abort();
    const result = await watchPromise;

    expect(result.reason).toBe("client_closed");
    const complete = events.find((event) => event.type === "backlog.complete");
    expect(complete?.payload.reason).toBe("client_closed");
  });
});

async function createBacklogFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-backlog-watch-"));
  const backlogDir = path.join(tempDir, ".codefleet/data/backlog");
  const acceptanceSpecPath = path.join(tempDir, ".codefleet/data/acceptance-testing/spec.json");
  const rolesPath = path.join(tempDir, ".codefleet/roles.json");

  await fs.mkdir(path.dirname(acceptanceSpecPath), { recursive: true });
  await fs.writeFile(
    acceptanceSpecPath,
    JSON.stringify({ version: 1, updatedAt: "2026-01-01T00:00:00.000Z", tests: [] }, null, 2),
    "utf8",
  );
  await fs.mkdir(path.dirname(rolesPath), { recursive: true });
  await fs.writeFile(rolesPath, JSON.stringify({ agents: [] }, null, 2), "utf8");

  const backlogService = new BacklogService(backlogDir, acceptanceSpecPath, rolesPath);
  const observability = new BacklogObservabilityService(backlogService, backlogDir);
  return { backlogService, observability };
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
