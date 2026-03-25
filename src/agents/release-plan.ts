import { ConversationalAgent, createFileTools, MarkdownPromptLoader } from "ai-kit";
import type { AgentContext, LLMClient, LLMChatInput, LLMClientOptions, LLMProvider, LLMResult, LLMStreamEvent } from "ai-kit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BacklogService } from "../domain/backlog/backlog-service.js";
import { DEFAULT_DOCUMENTS_ROOT_DIR } from "../domain/documents/document-service.js";
import { createBacklogAgentTools } from "./tools/backlog-agent-tools.js";
import { createReleasePlanAgentTools } from "./tools/release-plan-agent-tools.js";
import {
  resolveCodefleetFrontDeskRuntimeConfig,
  type CodefleetFrontDeskLlmConfig,
  type CodefleetFrontDeskRuntimeConfig,
} from "./front-desk.js";

export interface ReleasePlanRuntimeConfig extends CodefleetFrontDeskRuntimeConfig {}

export const CODEFLEET_RELEASE_PLAN_SYSTEM_PROMPT =
  createReleasePlanPromptLoader().format("instructions");

export function createCodefleetReleasePlanAgent(
  backlogService: BacklogService,
  runtimeConfig: ReleasePlanRuntimeConfig = {},
) {
  const resolvedConfig = resolveCodefleetFrontDeskRuntimeConfig(runtimeConfig);
  const llmClient = resolvedConfig.clientFactory(toLlmClientOptions(resolvedConfig.llm));
  const tools = [
    ...createBacklogAgentTools(backlogService),
    ...createReleasePlanAgentTools({
      releasePlansDir: resolvedConfig.releasePlansDir,
      projectRootDir: process.cwd(),
      eventPublisher: resolvedConfig.releasePlanEventPublisher,
    }),
    ...createSharedFileTools(resolvedConfig.fileToolWorkingDir),
  ];

  return (context: AgentContext) => {
    return new ConversationalAgent({
      // ai-kit now owns session-level conversation carry-over, so the app layer
      // should pass through the provided context instead of replaying history.
      context,
      client: llmClient,
      instructions: CODEFLEET_RELEASE_PLAN_SYSTEM_PROMPT,
      tools,
      maxTurns: resolvedConfig.maxTurns,
    });
  };
}

function createReleasePlanPromptLoader(): MarkdownPromptLoader {
  const promptsDir = path.join(resolveProjectRoot(), "src", "prompts", "release-plan");
  return new MarkdownPromptLoader({ baseDir: promptsDir });
}

function createSharedFileTools(workingDir: string) {
  const fileTools = createFileTools({
    workingDir,
    allowedPaths: [".", DEFAULT_DOCUMENTS_ROOT_DIR],
  });
  const listDirectory = fileTools.find((tool) => tool.name === "list_directory");
  const readFile = fileTools.find((tool) => tool.name === "read_file");
  const writeFile = fileTools.find((tool) => tool.name === "write_file");
  const makeDirectory = fileTools.find((tool) => tool.name === "make_directory");
  if (!listDirectory || !readFile || !writeFile || !makeDirectory) {
    throw new Error("release-plan file tools are unavailable");
  }
  return [listDirectory, readFile, writeFile, makeDirectory];
}

function resolveProjectRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..", "..");
}

function toLlmClientOptions(config: CodefleetFrontDeskLlmConfig): LLMClientOptions {
  const base = {
    model: config.model,
    apiKey: config.apiKey,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  };
  switch (config.provider) {
    case "openai":
      return { provider: "openai", ...base };
    case "anthropic":
      return { provider: "anthropic", ...base };
    case "google":
      return { provider: "google", ...base };
    case "perplexity":
      return { provider: "perplexity", ...base };
  }
}

class LazyLoadedLlmClient implements LLMClient {
  readonly provider: LLMProvider;
  readonly model: string;
  readonly capabilities = {
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsStreaming: true,
    supportsImages: true,
    contextWindowSize: 128_000,
  };
  private delegate: LLMClient | null = null;
  private delegatePromise: Promise<LLMClient> | null = null;

  constructor(private readonly options: LLMClientOptions) {
    this.provider = options.provider;
    this.model = options.model;
  }

  async invoke(input: LLMChatInput): Promise<LLMResult> {
    const client = await this.loadDelegate();
    return client.invoke(input);
  }

  stream(input: LLMChatInput): AsyncIterable<LLMStreamEvent> {
    return this.streamViaDelegate(input);
  }

  estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  private async *streamViaDelegate(input: LLMChatInput): AsyncIterable<LLMStreamEvent> {
    const client = await this.loadDelegate();
    yield* client.stream(input);
  }

  private async loadDelegate(): Promise<LLMClient> {
    if (this.delegate) {
      return this.delegate;
    }
    if (!this.delegatePromise) {
      this.delegatePromise = import("ai-kit").then(({ createLLMClient }) => {
        const client = createLLMClient(this.options);
        this.delegate = client;
        return client;
      });
    }
    return this.delegatePromise;
  }
}
