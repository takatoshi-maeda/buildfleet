import { AgentContextImpl, InMemoryHistory } from "ai-kit";
import type { LLMChatInput, LLMClient, LLMResult, LLMUsage } from "ai-kit";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCodefleetReleasePlanAgent } from "../src/agents/release-plan.js";
import type { BacklogService } from "../src/domain/backlog/backlog-service.js";

describe("release-plan native tools", () => {
  it("enables OpenAI native tools and allows apply_patch only for release-plan drafts", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "release-plan-native-"));
    const draftDir = path.join(tempDir, ".codefleet/runtime/release-plan-drafts");
    await fs.mkdir(draftDir, { recursive: true });
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      const capturedInputs: LLMChatInput[] = [];
      let streamCallCount = 0;
      const mockClient: LLMClient = {
        provider: "openai",
        model: "mock-release-plan",
        capabilities: {
          supportsReasoning: true,
          supportsToolCalls: true,
          supportsStreaming: true,
          supportsImages: false,
          contextWindowSize: 8_000,
        },
        estimateTokens: () => 0,
        invoke: async () => {
          throw new Error("invoke should not be called");
        },
        stream: async function* (input: LLMChatInput) {
          capturedInputs.push(input);
          streamCallCount += 1;
          if (streamCallCount === 1) {
            yield {
              type: "response.completed",
              result: toolUseResult([
                {
                  id: "shell-1",
                  name: "shell",
                  arguments: { commands: ["printf 'repo scan'"] },
                  executionKind: "provider_native",
                  provider: "openai",
                  extra: {
                    providerRaw: {
                      provider: "openai",
                      outputItems: [{ type: "shell_call", call_id: "shell-1", action: { commands: ["printf 'repo scan'"] } }],
                    },
                  },
                },
              ], "resp-1"),
            };
            return;
          }
          if (streamCallCount === 2) {
            yield {
              type: "response.completed",
              result: toolUseResult([
                {
                  id: "patch-1",
                  name: "apply_patch",
                  arguments: {
                    patch: "*** Begin Patch\n*** Add File: .codefleet/runtime/release-plan-drafts/draft.md\n+# Native Tools\n*** End Patch",
                  },
                  executionKind: "provider_native",
                  provider: "openai",
                  extra: {
                    providerRaw: {
                      provider: "openai",
                      outputItems: [{ type: "apply_patch_call", call_id: "patch-1", input: [] }],
                    },
                  },
                },
              ], "resp-2"),
            };
            return;
          }
          yield {
            type: "response.completed",
            result: {
              type: "message",
              content: "release plan drafted",
              toolCalls: [],
              usage: emptyUsage(),
              responseId: "resp-3",
              finishReason: "stop",
            },
          };
        },
      };

      const createAgent = createCodefleetReleasePlanAgent(
        {} as BacklogService,
        {
          llm: { provider: "openai", model: "gpt-5.3-codex", apiKey: "test-key" },
          clientFactory: () => mockClient,
          fileToolWorkingDir: tempDir,
          releasePlanDraftsDir: ".codefleet/runtime/release-plan-drafts",
          maxTurns: 4,
        },
      );
      const agent = createAgent(new AgentContextImpl({ history: new InMemoryHistory(), sessionId: "release-plan-native" }));
      const result = await agent.invoke("draft native tools");

      expect(result.content).toBe("release plan drafted");
      expect(capturedInputs[0]?.tools?.map((tool) => "name" in tool ? tool.name : tool.type)).toEqual([
        "backlog_epic_list",
        "backlog_epic_get",
        "backlog_item_list",
        "backlog_item_get",
        "release_plan_commit",
        "release_plan_list",
        "list_directory",
        "read_file",
        "make_directory",
        "shell",
        "apply_patch",
      ]);
      expect(capturedInputs[2]?.messages).toContainEqual(
        expect.objectContaining({
          role: "tool",
          toolCallId: "patch-1",
          extra: expect.objectContaining({
            tool: expect.objectContaining({
              result: expect.objectContaining({
                content: "Created .codefleet/runtime/release-plan-drafts/draft.md",
              }),
            }),
          }),
        }),
      );
      await expect(fs.readFile(path.join(draftDir, "draft.md"), "utf8")).resolves.toContain("Native Tools");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("rejects apply_patch writes outside release-plan draft storage", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "release-plan-native-guard-"));
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      const mockClient: LLMClient = {
        provider: "openai",
        model: "mock-release-plan",
        capabilities: {
          supportsReasoning: true,
          supportsToolCalls: true,
          supportsStreaming: true,
          supportsImages: false,
          contextWindowSize: 8_000,
        },
        estimateTokens: () => 0,
        invoke: async () => {
          throw new Error("invoke should not be called");
        },
        stream: async function* () {
          yield {
            type: "response.completed",
            result: toolUseResult([
              {
                id: "patch-blocked",
                name: "apply_patch",
                arguments: {
                  type: "create_file",
                  path: "src/forbidden.ts",
                  diff: "export const blocked = true;\n",
                },
                executionKind: "provider_native",
                provider: "openai",
                extra: {
                  providerRaw: {
                    provider: "openai",
                    outputItems: [{ type: "apply_patch_call", call_id: "patch-blocked", input: [] }],
                  },
                },
              },
            ], "resp-blocked"),
          };
        },
      };

      const createAgent = createCodefleetReleasePlanAgent(
        {} as BacklogService,
        {
          llm: { provider: "openai", model: "gpt-5.3-codex", apiKey: "test-key" },
          clientFactory: () => mockClient,
          fileToolWorkingDir: tempDir,
          releasePlanDraftsDir: ".codefleet/runtime/release-plan-drafts",
          maxTurns: 1,
        },
      );
      const agent = createAgent(new AgentContextImpl({ history: new InMemoryHistory(), sessionId: "release-plan-native-guard" }));

      await expect(agent.invoke("write outside drafts")).rejects.toThrow(/maximum turns/i);
      expect(await fs.stat(path.join(tempDir, "src")).catch(() => null)).toBeNull();
    } finally {
      process.chdir(originalCwd);
    }
  });
});

function toolUseResult(toolCalls: LLMResult["toolCalls"], responseId: string): LLMResult {
  return {
    type: "tool_use",
    content: null,
    toolCalls,
    usage: emptyUsage(),
    responseId,
    finishReason: "tool_use",
  };
}

function emptyUsage(): LLMUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    totalTokens: 0,
    inputCost: 0,
    outputCost: 0,
    cacheCost: 0,
    totalCost: 0,
  };
}
