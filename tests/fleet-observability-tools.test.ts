import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { registerFleetObservabilityTools } from "../src/api/mcp/tools/fleet-observability-tools.js";

interface RegisteredTool {
  name: string;
  handler: (args: unknown, extra?: unknown) => Promise<{
    isError: boolean;
    structuredContent?: Record<string, unknown>;
  }>;
}

function createTestMount() {
  const tools: RegisteredTool[] = [];
  return {
    mount: {
      mcpServer: {
        registerTool: (
          name: string,
          _meta: unknown,
          handler: RegisteredTool["handler"],
        ) => {
          tools.push({ name, handler });
        },
      },
    },
    tools,
  };
}

function getToolHandler(tools: RegisteredTool[], name: string) {
  const registered = tools.find((tool) => tool.name === name);
  if (!registered) {
    throw new Error(`tool not found in test mount: ${name}`);
  }
  return registered.handler;
}

function createBacklogService(backlogDir: string) {
  return {
    list: vi.fn(async () => ({
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      epics: [],
      items: [],
      questions: [],
    })),
    getBacklogDir: vi.fn(() => backlogDir),
  };
}

describe("registerFleetObservabilityTools", () => {
  it("maps invalid tool input to ERR_VALIDATION", async () => {
    const service = {
      listActivity: vi.fn(),
      watchActivity: vi.fn(),
      tailLogs: vi.fn(),
      watchLogsTail: vi.fn(),
    };
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-fleet-watch-tools-"));
    const backlogService = createBacklogService(tempDir);
    const { mount, tools } = createTestMount();
    registerFleetObservabilityTools(mount as never, backlogService as never, service as never);

    const logsTail = getToolHandler(tools, "fleet.logs.tail");
    const result = await logsTail({ arguments: { tailPerAgent: 0 } });

    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error).toEqual({
      code: "ERR_VALIDATION",
      message: "Number must be greater than or equal to 1",
    });
  });

  it("rejects includeAgents option in fleet.activity.list", async () => {
    const service = {
      listActivity: vi.fn(),
      watchActivity: vi.fn(),
      tailLogs: vi.fn(),
      watchLogsTail: vi.fn(),
    };
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-fleet-watch-tools-"));
    const backlogService = createBacklogService(tempDir);
    const { mount, tools } = createTestMount();
    registerFleetObservabilityTools(mount as never, backlogService as never, service as never);

    const activityList = getToolHandler(tools, "fleet.activity.list");
    const result = await activityList({ arguments: { includeAgents: true } });

    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error).toEqual({
      code: "ERR_VALIDATION",
      message: "Unrecognized key(s) in object: 'includeAgents'",
    });
  });

  it("accepts omitted agentRole and requests all roles", async () => {
    const service = {
      listActivity: vi.fn(),
      watchActivity: vi.fn(),
      tailLogs: vi.fn(async () => ({
        role: null,
        agents: [{ agentId: "developer-1", role: "Developer", lines: [], lineCount: 0, truncated: false }],
      })),
      watchLogsTail: vi.fn(),
    };
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-fleet-watch-tools-"));
    const backlogService = createBacklogService(tempDir);
    const { mount, tools } = createTestMount();
    registerFleetObservabilityTools(mount as never, backlogService as never, service as never);

    const tail = getToolHandler(tools, "fleet.logs.tail");
    const result = await tail({ arguments: { tailPerAgent: 10 } });

    expect(result.isError).toBe(false);
    expect(service.tailLogs).toHaveBeenCalledWith({
      role: undefined,
      agentId: undefined,
      tailPerAgent: 10,
      contains: undefined,
    });
  });

  it("passes agentId to logs tail query", async () => {
    const service = {
      listActivity: vi.fn(),
      watchActivity: vi.fn(),
      tailLogs: vi.fn(async () => ({
        role: null,
        agents: [{ agentId: "reviewer-1", role: "Reviewer", lines: ["line-1"], lineCount: 1, truncated: false }],
      })),
      watchLogsTail: vi.fn(),
    };
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-fleet-watch-tools-"));
    const backlogService = createBacklogService(tempDir);
    const { mount, tools } = createTestMount();
    registerFleetObservabilityTools(mount as never, backlogService as never, service as never);

    const tail = getToolHandler(tools, "fleet.logs.tail");
    const result = await tail({ arguments: { agentId: "reviewer-1", tailPerAgent: 20 } });

    expect(result.isError).toBe(false);
    expect(service.tailLogs).toHaveBeenCalledWith({
      role: undefined,
      agentId: "reviewer-1",
      tailPerAgent: 20,
      contains: undefined,
    });
  });

  it("rejects stream=true in fleet.logs.tail", async () => {
    const service = {
      listActivity: vi.fn(),
      watchActivity: vi.fn(),
      tailLogs: vi.fn(),
      watchLogsTail: vi.fn(),
    };
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-fleet-watch-tools-"));
    const backlogService = createBacklogService(tempDir);
    const { mount, tools } = createTestMount();
    registerFleetObservabilityTools(mount as never, backlogService as never, service as never);

    const tail = getToolHandler(tools, "fleet.logs.tail");
    const result = await tail({ arguments: { stream: true } });

    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error).toEqual({
      code: "ERR_VALIDATION",
      message: "Unrecognized key(s) in object: 'stream'",
    });
  });

  it("multiplexes backlog/activity/logs notifications in fleet.watch", async () => {
    const service = {
      listActivity: vi.fn(),
      watchActivity: vi.fn(async (input: { onEvent?: (event: { type: string; payload: Record<string, unknown> }) => Promise<void> }) => {
        await input.onEvent?.({
          type: "fleet.activity.snapshot",
          payload: { updatedAt: "2026-01-01T00:00:00.000Z", roles: [], notificationToken: "tok-1" },
        });
        return {
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:00.000Z",
          eventCount: 1,
          reason: "client_closed",
        };
      }),
      tailLogs: vi.fn(),
      watchLogsTail: vi.fn(async (input: { onEvent?: (event: { type: string; payload: Record<string, unknown> }) => Promise<void> }) => {
        await input.onEvent?.({
          type: "fleet.logs.chunk",
          payload: { agentId: "developer-1", lines: ["line-a"], notificationToken: "tok-1" },
        });
        return {
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:00.000Z",
          eventCount: 1,
          reason: "client_closed",
        };
      }),
    };
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-fleet-watch-tools-"));
    const backlogService = createBacklogService(tempDir);
    const { mount, tools } = createTestMount();
    registerFleetObservabilityTools(mount as never, backlogService as never, service as never);
    const notifications: Array<{ method: string; params: Record<string, unknown> }> = [];
    const controller = new AbortController();
    controller.abort();

    const watch = getToolHandler(tools, "fleet.watch");
    const result = await watch(
      { arguments: { notificationToken: "tok-1", heartbeatSec: 5 } },
      {
        signal: controller.signal,
        sendNotification: async (event: { method: string; params: Record<string, unknown> }) => {
          notifications.push(event);
        },
      },
    );

    expect(result.isError).toBe(false);
    expect(notifications.some((entry) => entry.method === "backlog.snapshot")).toBe(true);
    expect(notifications.some((entry) => entry.method === "fleet.activity.snapshot")).toBe(true);
    expect(notifications.some((entry) => entry.method === "fleet.logs.chunk")).toBe(true);
    expect(notifications[notifications.length - 1]?.method).toBe("fleet.watch.complete");
    expect(notifications.every((entry) => entry.params.notificationToken === "tok-1")).toBe(true);
  });

  it("validates fleet.watch input keys", async () => {
    const service = {
      listActivity: vi.fn(),
      watchActivity: vi.fn(),
      tailLogs: vi.fn(),
      watchLogsTail: vi.fn(),
    };
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-fleet-watch-tools-"));
    const backlogService = createBacklogService(tempDir);
    const { mount, tools } = createTestMount();
    registerFleetObservabilityTools(mount as never, backlogService as never, service as never);

    const watch = getToolHandler(tools, "fleet.watch");
    const result = await watch({ arguments: { includeSnapshot: true } });

    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error).toEqual({
      code: "ERR_VALIDATION",
      message: "Unrecognized key(s) in object: 'includeSnapshot'",
    });
  });

  it("emits fleet.watch.error and keeps stream result on partial failure", async () => {
    const service = {
      listActivity: vi.fn(),
      watchActivity: vi.fn(async () => {
        throw new Error("activity failed");
      }),
      tailLogs: vi.fn(),
      watchLogsTail: vi.fn(async () => ({
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:00:00.000Z",
        eventCount: 0,
        reason: "client_closed",
      })),
    };
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-fleet-watch-tools-"));
    const backlogService = createBacklogService(tempDir);
    const { mount, tools } = createTestMount();
    registerFleetObservabilityTools(mount as never, backlogService as never, service as never);
    const notifications: Array<{ method: string; params: Record<string, unknown> }> = [];
    const controller = new AbortController();
    controller.abort();

    const watch = getToolHandler(tools, "fleet.watch");
    const result = await watch(
      { arguments: {} },
      {
        signal: controller.signal,
        sendNotification: async (event: { method: string; params: Record<string, unknown> }) => {
          notifications.push(event);
        },
      },
    );

    expect(result.isError).toBe(false);
    expect(notifications.some((entry) => entry.method === "fleet.watch.error")).toBe(true);
    expect(notifications[notifications.length - 1]?.method).toBe("fleet.watch.complete");
  });

  it("does not register fleet.activity.watch", async () => {
    const service = {
      listActivity: vi.fn(),
      watchActivity: vi.fn(),
      tailLogs: vi.fn(),
      watchLogsTail: vi.fn(),
    };
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-fleet-watch-tools-"));
    const backlogService = createBacklogService(tempDir);
    const { mount, tools } = createTestMount();
    registerFleetObservabilityTools(mount as never, backlogService as never, service as never);

    expect(tools.some((tool) => tool.name === "fleet.activity.watch")).toBe(false);
  });

  it("does not register fleet.executions.watch", async () => {
    const service = {
      listActivity: vi.fn(),
      watchActivity: vi.fn(),
      tailLogs: vi.fn(),
      watchLogsTail: vi.fn(),
    };
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-fleet-watch-tools-"));
    const backlogService = createBacklogService(tempDir);
    const { mount, tools } = createTestMount();
    registerFleetObservabilityTools(mount as never, backlogService as never, service as never);

    expect(tools.some((tool) => tool.name === "fleet.executions.watch")).toBe(false);
  });

  it("does not register fleet.executions.list", async () => {
    const service = {
      listActivity: vi.fn(),
      watchActivity: vi.fn(),
      tailLogs: vi.fn(),
      watchLogsTail: vi.fn(),
    };
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-fleet-watch-tools-"));
    const backlogService = createBacklogService(tempDir);
    const { mount, tools } = createTestMount();
    registerFleetObservabilityTools(mount as never, backlogService as never, service as never);

    expect(tools.some((tool) => tool.name === "fleet.executions.list")).toBe(false);
  });
});
