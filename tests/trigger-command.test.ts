import { afterEach, describe, expect, it, vi } from "vitest";
import { createTriggerCommand } from "../src/cli/commands/trigger.js";
import type { RouteResult, SystemEvent } from "../src/events/router.js";
import type { AgentEventQueueEnqueueResult } from "../src/domain/events/agent-event-queue-service.js";

class RecordingRouter {
  public events: SystemEvent[] = [];

  async route(event: SystemEvent): Promise<RouteResult> {
    this.events.push(event);
    return { deduped: false, executions: [] };
  }
}

class RecordingQueue {
  public events: SystemEvent[] = [];

  async enqueueToRunningAgents(event: SystemEvent): Promise<AgentEventQueueEnqueueResult> {
    this.events.push(event);
    return { enqueuedAgentIds: ["developer-1"], files: [".codefleet/runtime/events/agents/developer-1/pending/a.json"] };
  }
}

describe("trigger command", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows event subcommands and their params via --help", async () => {
    const command = createTriggerCommand();
    let output = "";
    command
      .exitOverride()
      .configureOutput({
        writeOut: (str) => {
          output += str;
        },
        writeErr: (str) => {
          output += str;
        },
      });

    await expect(command.parseAsync(["--help"], { from: "user" })).rejects.toBeDefined();

    expect(output).toContain("docs.update");
    expect(output).toContain("acceptance-test.update");
    expect(output).toContain("backlog.update");
    expect(output).toContain("--paths <path> (repeatable/comma-separated)");
    expect(output).not.toContain("docs.update [options]");
  });

  it("shows docs.update params via subcommand --help", async () => {
    const command = createTriggerCommand();
    let output = "";
    command
      .exitOverride()
      .configureOutput({
        writeOut: (str) => {
          output += str;
        },
        writeErr: (str) => {
          output += str;
        },
      });

    await expect(command.parseAsync(["docs.update", "--help"], { from: "user" })).rejects.toBeDefined();
    expect(output).toContain("--paths <path>");
  });

  it("builds docs.update event from --paths option values", async () => {
    const router = new RecordingRouter();
    const queue = new RecordingQueue();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await createTriggerCommand({ router, queue }).parseAsync(
      ["docs.update", "--paths", "docs/a.md,docs/b.md", "--paths", "docs/c.md"],
      { from: "user" },
    );

    expect(router.events).toEqual([
      {
        type: "docs.update",
        paths: ["docs/a.md", "docs/b.md", "docs/c.md"],
      },
    ]);
    expect(queue.events).toEqual([
      {
        type: "docs.update",
        paths: ["docs/a.md", "docs/b.md", "docs/c.md"],
      },
    ]);
    expect(logSpy).toHaveBeenCalled();
  });

  it("builds acceptance-test.update event with no options", async () => {
    const router = new RecordingRouter();
    const queue = new RecordingQueue();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await createTriggerCommand({ router, queue }).parseAsync(["acceptance-test.update"], { from: "user" });

    expect(router.events).toEqual([{ type: "acceptance-test.update" }]);
    expect(queue.events).toEqual([{ type: "acceptance-test.update" }]);
    expect(logSpy).toHaveBeenCalled();
  });

  it("builds backlog.update event with no options", async () => {
    const router = new RecordingRouter();
    const queue = new RecordingQueue();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await createTriggerCommand({ router, queue }).parseAsync(["backlog.update"], { from: "user" });

    expect(router.events).toEqual([{ type: "backlog.update" }]);
    expect(queue.events).toEqual([{ type: "backlog.update" }]);
    expect(logSpy).toHaveBeenCalled();
  });

  it("rejects unknown event subcommand", async () => {
    const router = new RecordingRouter();
    const command = createTriggerCommand({ router, queue: new RecordingQueue() }).exitOverride();

    await expect(
      command.parseAsync(["manual.triggered", "--actor", "Developer"], { from: "user" }),
    ).rejects.toThrow(/unknown command 'manual\.triggered'/u);
  });
});
