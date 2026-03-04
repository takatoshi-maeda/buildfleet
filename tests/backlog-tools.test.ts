import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CodefleetError } from "../src/shared/errors.js";
import { registerBacklogMcpTools } from "../src/api/mcp/tools/backlog-tools.js";
import { BacklogService } from "../src/domain/backlog/backlog-service.js";

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

describe("registerBacklogMcpTools", () => {
  it("maps CodefleetError to MCP error payload", async () => {
    const list = vi.fn(async () => ({ epics: [], items: [], questions: [], version: 1, updatedAt: "2026-01-01T00:00:00.000Z" }));
    const readEpic = vi.fn(async () => {
      throw new CodefleetError("ERR_NOT_FOUND", "epic not found: E-999");
    });
    const readItem = vi.fn(async () => ({ id: "I-001" }));
    const { mount, tools } = createTestMount();
    registerBacklogMcpTools(mount as never, { list, readEpic, readItem } as never);

    const backlogEpicGet = getToolHandler(tools, "backlog.epic.get");
    const result = await backlogEpicGet({ arguments: { id: "E-999" } });

    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error).toEqual({
      code: "ERR_NOT_FOUND",
      message: "epic not found: E-999",
    });
  });

  it("maps invalid input to ERR_VALIDATION", async () => {
    const list = vi.fn(async () => ({ epics: [], items: [], questions: [], version: 1, updatedAt: "2026-01-01T00:00:00.000Z" }));
    const readEpic = vi.fn(async () => ({ id: "E-001" }));
    const readItem = vi.fn(async () => ({ id: "I-001" }));
    const { mount, tools } = createTestMount();
    registerBacklogMcpTools(mount as never, { list, readEpic, readItem } as never);

    const backlogItemGet = getToolHandler(tools, "backlog.item.get");
    const result = await backlogItemGet({ arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error).toEqual({
      code: "ERR_VALIDATION",
      message: "Required",
    });
  });

  it("validates backlog.watch boundary input", async () => {
    const list = vi.fn(async () => ({ epics: [], items: [], questions: [], version: 1, updatedAt: "2026-01-01T00:00:00.000Z" }));
    const readEpic = vi.fn(async () => ({ id: "E-001" }));
    const readItem = vi.fn(async () => ({ id: "I-001" }));
    const { mount, tools } = createTestMount();
    registerBacklogMcpTools(mount as never, { list, readEpic, readItem, getBacklogDir: () => ".codefleet/data/backlog" } as never);

    const backlogWatch = getToolHandler(tools, "backlog.watch");
    const result = await backlogWatch({ arguments: { heartbeatSec: 4 } });

    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error).toEqual({
      code: "ERR_VALIDATION",
      message: "Number must be greater than or equal to 5",
    });
  });

  it("forwards notificationToken in backlog.watch notifications", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-backlog-tool-watch-"));
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
    const service = new BacklogService(backlogDir, acceptanceSpecPath, rolesPath);
    await service.addEpic({ title: "watch-target", acceptanceTestIds: [] });

    const { mount, tools } = createTestMount();
    registerBacklogMcpTools(mount as never, service as never);
    const notifications: Array<{ method: string; params: Record<string, unknown> }> = [];

    const backlogWatch = getToolHandler(tools, "backlog.watch");
    const result = await backlogWatch(
      { arguments: { notificationToken: "tok-1", maxDurationSec: 1, heartbeatSec: 5 } },
      {
        sendNotification: async (event: { method: string; params: Record<string, unknown> }) => {
          notifications.push(event);
        },
      },
    );

    expect(result.isError).toBe(false);
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications.every((entry) => entry.params.notificationToken === "tok-1")).toBe(true);
    expect(notifications[0]?.method).toBe("backlog.snapshot");
    expect(notifications[notifications.length - 1]?.method).toBe("backlog.complete");
  });
});
