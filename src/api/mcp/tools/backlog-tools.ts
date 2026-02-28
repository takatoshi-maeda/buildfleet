import { z } from "zod";
import type { AgentMount } from "../../../../vendor/ai-kit/src/hono/index.js";
import type { BacklogService } from "../../../domain/backlog/backlog-service.js";
import { CodefleetError } from "../../../shared/errors.js";
import type { McpToolAuditLogEntry, McpToolAuditLogger } from "./mcp-tool-audit-log.js";

const BacklogEpicStatusSchema = z.enum(["todo", "in-progress", "in-review", "changes-requested", "done", "blocked", "failed"]);
const BacklogItemStatusSchema = z.enum(["todo", "wait-implementation", "in-progress", "done", "blocked"]);
const BacklogWorkKindSchema = z.enum(["product", "technical"]);

const BacklogEpicListInputSchema = z.object({
  status: BacklogEpicStatusSchema.optional(),
  kind: BacklogWorkKindSchema.optional(),
  includeHidden: z.boolean().optional(),
  actorId: z.string().optional(),
});

const BacklogEpicGetInputSchema = z.object({
  id: z.string().min(1),
});
const BacklogEpicGetMcpInputSchema = z.object({
  id: z.string().optional(),
});

const BacklogItemListInputSchema = z.object({
  epicId: z.string().optional(),
  status: BacklogItemStatusSchema.optional(),
  kind: BacklogWorkKindSchema.optional(),
  includeHidden: z.boolean().optional(),
  actorId: z.string().optional(),
});

const BacklogItemGetInputSchema = z.object({
  id: z.string().min(1),
});
const BacklogItemGetMcpInputSchema = z.object({
  id: z.string().optional(),
});

interface RegisterBacklogMcpToolsOptions {
  agentName?: string;
  logger?: McpToolAuditLogger;
}

export function registerBacklogMcpTools(
  mount: AgentMount,
  service: BacklogService,
  options: RegisterBacklogMcpToolsOptions = {},
): void {
  const agentName = options.agentName ?? "codefleet.front-desk";

  mount.mcpServer.registerTool(
    "backlog.epic.list",
    {
      description: "List backlog epics",
      inputSchema: BacklogEpicListInputSchema.shape,
    },
    async (args) =>
      executeTool({
        toolName: "backlog.epic.list",
        args,
        agentName,
        logger: options.logger,
        run: async () => {
          const input = BacklogEpicListInputSchema.parse(normalizeToolArgs(args));
          const listed = await service.list(input);
          return {
            epics: listed.epics,
            count: listed.epics.length,
            updatedAt: listed.updatedAt,
          };
        },
      }),
  );

  mount.mcpServer.registerTool(
    "backlog.epic.get",
    {
      description: "Get a backlog epic by id",
      inputSchema: BacklogEpicGetMcpInputSchema.shape,
    },
    async (args) =>
      executeTool({
        toolName: "backlog.epic.get",
        args,
        agentName,
        logger: options.logger,
        run: async () => {
          const input = BacklogEpicGetInputSchema.parse(normalizeToolArgs(args));
          return { epic: await service.readEpic(input) };
        },
      }),
  );

  mount.mcpServer.registerTool(
    "backlog.item.list",
    {
      description: "List backlog items",
      inputSchema: BacklogItemListInputSchema.shape,
    },
    async (args) =>
      executeTool({
        toolName: "backlog.item.list",
        args,
        agentName,
        logger: options.logger,
        run: async () => {
          const input = BacklogItemListInputSchema.parse(normalizeToolArgs(args));
          const listed = await service.list(input);
          return {
            items: listed.items,
            count: listed.items.length,
            updatedAt: listed.updatedAt,
          };
        },
      }),
  );

  mount.mcpServer.registerTool(
    "backlog.item.get",
    {
      description: "Get a backlog item by id",
      inputSchema: BacklogItemGetMcpInputSchema.shape,
    },
    async (args) =>
      executeTool({
        toolName: "backlog.item.get",
        args,
        agentName,
        logger: options.logger,
        run: async () => {
          const input = BacklogItemGetInputSchema.parse(normalizeToolArgs(args));
          return { item: await service.readItem(input) };
        },
      }),
  );
}

async function executeTool(input: {
  toolName: string;
  args: unknown;
  agentName: string;
  logger?: McpToolAuditLogger;
  run: () => Promise<Record<string, unknown>>;
}) {
  const startedAt = Date.now();
  const normalizedArgs = normalizeToolArgs(input.args);

  try {
    const payload = await input.run();
    const response = success(payload);
    await writeAuditLog(input.logger, {
      ts: new Date().toISOString(),
      agent: input.agentName,
      tool: input.toolName,
      input: normalizedArgs,
      durationMs: Date.now() - startedAt,
      isError: false,
      ...(typeof payload.count === "number" ? { resultCount: payload.count } : {}),
    });
    return response;
  } catch (error) {
    const mapped = mapToolError(error);
    const mappedError = mapped.structuredContent?.error as { code?: unknown; message?: unknown } | undefined;
    await writeAuditLog(input.logger, {
      ts: new Date().toISOString(),
      agent: input.agentName,
      tool: input.toolName,
      input: normalizedArgs,
      durationMs: Date.now() - startedAt,
      isError: true,
      ...(typeof mappedError?.code === "string" ? { errorCode: mappedError.code } : {}),
      ...(typeof mappedError?.message === "string" ? { errorMessage: mappedError.message } : {}),
    });
    return mapped;
  }
}

async function writeAuditLog(logger: McpToolAuditLogger | undefined, entry: McpToolAuditLogEntry): Promise<void> {
  if (!logger) {
    return;
  }

  try {
    await logger.log(entry);
  } catch (error) {
    // Logging failures must not break tool execution.
    console.warn(
      `[codefleet:mcp] failed to write backlog tool audit log: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function success(payload: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: false,
  };
}

function mapToolError(error: unknown) {
  if (error instanceof CodefleetError) {
    const payload = {
      error: {
        code: error.code,
        message: error.message,
      },
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
      isError: true,
    };
  }

  if (error instanceof z.ZodError) {
    const payload = {
      error: {
        code: "ERR_VALIDATION",
        message: error.issues.map((issue) => issue.message).join("; "),
      },
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
      isError: true,
    };
  }

  const payload = {
    error: {
      code: "ERR_UNEXPECTED",
      message: error instanceof Error ? error.message : String(error),
    },
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: true,
  };
}

function normalizeToolArgs(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  if ("arguments" in value) {
    const wrapped = (value as { arguments?: unknown }).arguments;
    if (wrapped && typeof wrapped === "object" && !Array.isArray(wrapped)) {
      return wrapped as Record<string, unknown>;
    }
  }
  return value as Record<string, unknown>;
}
