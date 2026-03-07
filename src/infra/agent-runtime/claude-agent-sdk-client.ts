import { query, type Options, type Query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export interface ClaudeAgentSdkClient {
  query(input: { prompt: string; options: Options }): Query;
}

export class DefaultClaudeAgentSdkClient implements ClaudeAgentSdkClient {
  query(input: { prompt: string; options: Options }): Query {
    return query({
      prompt: input.prompt,
      options: input.options,
    });
  }
}

export type { Options as ClaudeAgentSdkOptions, Query as ClaudeAgentSdkQuery, SDKMessage as ClaudeAgentSdkMessage };
