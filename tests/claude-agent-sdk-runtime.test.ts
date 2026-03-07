import { describe, expect, it } from "vitest";
import { ClaudeAgentSdkRuntime } from "../src/infra/agent-runtime/claude-agent-sdk-runtime.js";
import type { ClaudeAgentSdkClient } from "../src/infra/agent-runtime/claude-agent-sdk-client.js";

class FakeClaudeQuery implements AsyncIterable<{
  type: "system" | "assistant" | "result";
  subtype?: string;
  uuid: string;
  session_id: string;
}> {
  public closed = false;

  constructor(
    private readonly messages: Array<{
      type: "system" | "assistant" | "result";
      subtype?: string;
      uuid: string;
      session_id: string;
    }>,
  ) {}

  close(): void {
    this.closed = true;
  }

  async *[Symbol.asyncIterator]() {
    for (const message of this.messages) {
      if (this.closed) {
        return;
      }
      yield message;
    }
  }
}

class FakeClaudeAgentSdkClient implements ClaudeAgentSdkClient {
  public calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
  public lastQuery: FakeClaudeQuery | null = null;

  query(input: { prompt: string; options: Record<string, unknown> }): FakeClaudeQuery {
    this.calls.push(input);
    this.lastQuery = new FakeClaudeQuery([
      { type: "system", subtype: "init", uuid: "msg-init", session_id: "sess-123" },
      { type: "assistant", uuid: "msg-assistant", session_id: "sess-123" },
      { type: "result", subtype: "success", uuid: "msg-result", session_id: "sess-123" },
    ]);
    return this.lastQuery;
  }
}

describe("ClaudeAgentSdkRuntime", () => {
  it("maps Claude query execution into provider-neutral session state", async () => {
    const client = new FakeClaudeAgentSdkClient();
    const runtime = new ClaudeAgentSdkRuntime(client);

    const prepared = await runtime.prepareAgent({
      agentId: "orchestrator-1",
      role: "Orchestrator",
      cwd: "/workspace",
      detached: false,
      startupPrompt: "You are Orchestrator.",
      runtimeConfig: { model: "claude-sonnet-4-5", permissionMode: "acceptEdits", persistSession: false },
    });
    expect(prepared.provider).toBe("claude-agent-sdk");
    expect(prepared.pid).toBeNull();

    const result = await runtime.execute({
      agentId: "orchestrator-1",
      role: "Orchestrator",
      cwd: "/workspace",
      prompt: "Implement this event",
      responseLanguage: "日本語",
      runtimeConfig: {
        model: "claude-sonnet-4-5",
        permissionMode: "acceptEdits",
        allowedTools: ["Bash", "Read"],
        maxTurns: 20,
        persistSession: false,
      },
    });

    expect(client.calls[0]?.prompt).toBe("Implement this event");
    expect(client.calls[0]?.options).toMatchObject({
      cwd: "/workspace",
      model: "claude-sonnet-4-5",
      permissionMode: "acceptEdits",
      allowedTools: ["Bash", "Read"],
      maxTurns: 20,
      settingSources: [],
      tools: { type: "preset", preset: "claude_code" },
    });
    expect(result).toMatchObject({
      provider: "claude-agent-sdk",
      session: {
        conversationId: "sess-123",
        activeInvocationId: "msg-result",
      },
    });
  });

  it("resumes an existing session when persistSession is enabled and shutdown closes in-flight query", async () => {
    const client = new FakeClaudeAgentSdkClient();
    const runtime = new ClaudeAgentSdkRuntime(client);

    const execution = runtime.execute({
      agentId: "orchestrator-1",
      role: "Orchestrator",
      cwd: "/workspace",
      prompt: "Continue work",
      currentSession: {
        conversationId: "sess-existing",
        activeInvocationId: "msg-old",
        lastActivityAt: "2026-01-01T00:00:00.000Z",
      },
      runtimeConfig: {
        persistSession: true,
        settingSources: ["project"],
      },
    });

    await runtime.shutdownAgent("orchestrator-1");
    expect(client.lastQuery?.closed).toBe(true);
    await execution;
    expect(client.calls[0]?.options.resume).toBe("sess-existing");
    expect(client.calls[0]?.options.settingSources).toEqual(["project"]);
  });
});
