import { AgentContextImpl, InMemoryHistory } from "ai-kit";
import type { LLMChatInput, LLMClient, LLMResult, LLMUsage } from "ai-kit";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCodefleetRequirementsInterviewerAgent } from "../src/agents/requirements-interviewer.js";
import type { BacklogService } from "../src/domain/backlog/backlog-service.js";

describe("requirements-interviewer native tools", () => {
  it("enables OpenAI native tools and returns provider raw follow-up items", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "requirements-native-"));
    const specDir = path.join(tempDir, "docs/spec");
    await fs.mkdir(specDir, { recursive: true });
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      const capturedInputs: LLMChatInput[] = [];
      let streamCallCount = 0;
      const mockClient: LLMClient = {
        provider: "openai",
        model: "mock-requirements-interviewer",
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
                    patch: "*** Begin Patch\n*** Add File: docs/spec/native-tools.md\n+# Native Tools\n*** End Patch",
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
              content: "spec drafted",
              toolCalls: [],
              usage: emptyUsage(),
              responseId: "resp-3",
              finishReason: "stop",
            },
          };
        },
      };

      const createAgent = createCodefleetRequirementsInterviewerAgent(
        {} as BacklogService,
        {
          llm: { provider: "openai", model: "gpt-5.3-codex", apiKey: "test-key" },
          clientFactory: () => mockClient,
          fileToolWorkingDir: tempDir,
          maxTurns: 4,
        },
      );
      const agent = createAgent(new AgentContextImpl({ history: new InMemoryHistory(), sessionId: "requirements-native" }));
      const result = await agent.invoke("document native tools");

      expect(result.content).toBe("spec drafted");
      expect(capturedInputs[0]?.tools?.map((tool) => "name" in tool ? tool.name : tool.type)).toEqual([
        "find_files",
        "tree",
        "list_directory",
        "read_file",
        "make_directory",
        "shell",
        "apply_patch",
      ]);
      expect(capturedInputs[1]?.messages).toContainEqual(
        expect.objectContaining({
          role: "tool",
          toolCallId: "shell-1",
          extra: expect.objectContaining({
            providerRaw: expect.objectContaining({
              provider: "openai",
              inputItems: expect.arrayContaining([
                expect.objectContaining({ type: "shell_call" }),
                expect.objectContaining({ type: "shell_call_output", call_id: "shell-1" }),
              ]),
            }),
          }),
        }),
      );
      expect(capturedInputs[2]?.messages).toContainEqual(
        expect.objectContaining({
          role: "tool",
          toolCallId: "patch-1",
          extra: expect.objectContaining({
            tool: expect.objectContaining({
              result: expect.objectContaining({
                content: "Created docs/spec/native-tools.md",
              }),
            }),
          }),
        }),
      );
      await expect(fs.readFile(path.join(specDir, "native-tools.md"), "utf8")).resolves.toContain("Native Tools");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("rejects apply_patch writes outside docs/spec", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "requirements-native-guard-"));
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      const mockClient: LLMClient = {
        provider: "openai",
        model: "mock-requirements-interviewer",
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

      const createAgent = createCodefleetRequirementsInterviewerAgent(
        {} as BacklogService,
        {
          llm: { provider: "openai", model: "gpt-5.3-codex", apiKey: "test-key" },
          clientFactory: () => mockClient,
          fileToolWorkingDir: tempDir,
          maxTurns: 1,
        },
      );
      const agent = createAgent(new AgentContextImpl({ history: new InMemoryHistory(), sessionId: "requirements-native-guard" }));

      await expect(agent.invoke("write outside spec")).rejects.toThrow(/maximum turns/i);
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
