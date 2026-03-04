import { describe, expect, it, vi } from "vitest";
import { CodefleetError } from "../src/shared/errors.js";
import { registerBacklogMcpTools } from "../src/api/mcp/tools/backlog-tools.js";

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

  it("does not register backlog.watch", async () => {
    const list = vi.fn(async () => ({ epics: [], items: [], questions: [], version: 1, updatedAt: "2026-01-01T00:00:00.000Z" }));
    const readEpic = vi.fn(async () => ({ id: "E-001" }));
    const readItem = vi.fn(async () => ({ id: "I-001" }));
    const { mount, tools } = createTestMount();
    registerBacklogMcpTools(mount as never, { list, readEpic, readItem, getBacklogDir: () => ".codefleet/data/backlog" } as never);

    expect(tools.some((tool) => tool.name === "backlog.watch")).toBe(false);
  });
});
