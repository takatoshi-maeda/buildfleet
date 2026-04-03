import {
  callTool,
  callToolStream,
  createAiKitClient,
  type AgentRunResult,
  type ConversationSummary,
  type ConversationsGetResult,
  type ConversationsListResult,
  type DocumentActor,
  type DocumentFileResult,
  type DocumentTreeResult,
  type DocumentWatchEvent,
  type JsonRpcId,
  type JsonRpcNotification,
  type StreamRequestOptions,
} from '@takatoshi-maeda/ai-kit-expo/client';

import {
  decodeCodefleetEpicGet,
  decodeCodefleetEpicList,
  decodeCodefleetItemGet,
  decodeCodefleetItemList,
  decodeCodefleetWatchResult,
} from './decoders';
import type {
  CodefleetEpicGetResult,
  CodefleetEpicListResult,
  CodefleetItemGetResult,
  CodefleetItemListResult,
  CodefleetWatchResult,
} from './types';

const MCP_PROTOCOL_VERSION = '2025-03-26';
const CODEFLEET_DOCUMENT_BASE_PATH = '/api/codefleet/documents';

export type { AgentRunResult, DocumentActor, DocumentFileResult, DocumentTreeResult, DocumentWatchEvent, JsonRpcId, JsonRpcNotification, StreamRequestOptions };
export type ConversationGetResult = ConversationsGetResult;
export type { ConversationSummary };

export type ImageContentPart = {
  type: 'image';
  source: { type: 'url'; url: string } | { type: 'base64'; mediaType: string; data: string };
};

export type FileContentPart = {
  type: 'file';
  file: {
    name: string;
    mimeType: string;
    sizeBytes: number;
    source:
      | { type: 'asset-ref'; assetRef: string }
      | { type: 'url'; url: string }
      | { type: 'base64'; mediaType: string; data: string };
  };
};

export type AgentContentPart =
  | { type: 'text'; text: string }
  | ImageContentPart
  | FileContentPart
  | { type: 'audio'; data: string; format: string };

export type FleetStatusResponse = {
  nodes?: {
    self?: {
      projectId?: string;
      endpoint?: string;
    };
    peers?: {
      projectId?: string;
      endpoint?: string;
    }[];
  };
};

export type CodefleetClient = {
  listBacklogEpics(): Promise<CodefleetEpicListResult>;
  getBacklogEpic(id: string): Promise<CodefleetEpicGetResult>;
  listBacklogItems(): Promise<CodefleetItemListResult>;
  getBacklogItem(id: string): Promise<CodefleetItemGetResult>;
  watchFleet(
    args: {
      heartbeatSec?: number;
      notificationToken?: string;
    },
    options?: StreamRequestOptions,
  ): Promise<CodefleetWatchResult>;
  fetchFleetStatus(endpoint: string): Promise<FleetStatusResponse | null>;
  listConversations(limit?: number, agentId?: string): Promise<ConversationsListResult>;
  getConversation(sessionId: string, agentId?: string): Promise<ConversationsGetResult>;
  runAgent(args: {
    message?: string;
    input?: AgentContentPart[] | string;
    sessionId?: string | null;
    agentId?: string;
    signal?: AbortSignal;
    onStreamEvent?: (message: JsonRpcNotification) => void;
  }): Promise<AgentRunResult>;
  listDocumentsTree(): Promise<DocumentTreeResult>;
  getDocumentFile(path: string): Promise<DocumentFileResult>;
  saveDocumentFile(args: {
    path: string;
    content: string;
    baseVersion?: string | null;
    actor?: DocumentActor | null;
  }): Promise<DocumentFileResult>;
  watchDocuments(args: {
    signal?: AbortSignal;
    onEvent?: (event: DocumentWatchEvent) => void;
  }): Promise<void>;
  getDocumentAssetUrl(path: string): string;
};

type CreateCodefleetMcpClientOptions = {
  getBaseUrl: () => string;
  agentName?: string;
  protocolVersion?: string;
  clientInfo?: {
    name: string;
    version: string;
  };
};

function createNotificationToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `token-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function createSharedClient(options: CreateCodefleetMcpClientOptions) {
  return createAiKitClient({
    baseUrl: normalizeBaseUrl(options.getBaseUrl()),
    defaultAgentName: options.agentName ?? 'codefleet',
    protocolVersion: options.protocolVersion ?? MCP_PROTOCOL_VERSION,
    clientInfo: options.clientInfo ?? {
      name: 'codefleet-ui',
      version: '0.1.0',
    },
    documentBasePath: CODEFLEET_DOCUMENT_BASE_PATH,
  });
}

async function callCodefleetTool<T>(
  options: CreateCodefleetMcpClientOptions,
  toolName: string,
  args: Record<string, unknown>,
  requestOptions: StreamRequestOptions = {},
): Promise<T> {
  return callTool<T>(createSharedClient(options), toolName, args, requestOptions);
}

async function callCodefleetToolStream<T>(
  options: CreateCodefleetMcpClientOptions,
  toolName: string,
  args: Record<string, unknown>,
  requestOptions: StreamRequestOptions = {},
): Promise<T> {
  return callToolStream<T>(createSharedClient(options), toolName, args, requestOptions);
}

export function createCodefleetMcpClient(
  options: CreateCodefleetMcpClientOptions,
): CodefleetClient {
  return {
    async listBacklogEpics() {
      const raw = await callCodefleetTool<unknown>(options, 'backlog.epic.list', {});
      return decodeCodefleetEpicList(raw);
    },
    async getBacklogEpic(id: string) {
      const raw = await callCodefleetTool<unknown>(options, 'backlog.epic.get', { id });
      return decodeCodefleetEpicGet(raw);
    },
    async listBacklogItems() {
      const raw = await callCodefleetTool<unknown>(options, 'backlog.item.list', {});
      return decodeCodefleetItemList(raw);
    },
    async getBacklogItem(id: string) {
      const raw = await callCodefleetTool<unknown>(options, 'backlog.item.get', { id });
      return decodeCodefleetItemGet(raw);
    },
    async watchFleet(args, requestOptions = {}) {
      const raw = await callCodefleetToolStream<unknown>(
        options,
        'fleet.watch',
        args,
        requestOptions,
      );
      return decodeCodefleetWatchResult(raw);
    },
    async fetchFleetStatus(endpoint: string) {
      const response = await fetch(`${normalizeBaseUrl(endpoint)}/api/codefleet/status`);
      if (!response.ok) return null;
      return (await response.json()) as FleetStatusResponse;
    },
    async listConversations(limit = 50, agentId) {
      return callCodefleetTool<ConversationsListResult>(
        options,
        'conversations.list',
        { limit, ...(agentId ? { agentId } : {}) },
      );
    },
    async getConversation(sessionId: string, agentId) {
      return callCodefleetTool<ConversationsGetResult>(
        options,
        'conversations.get',
        { sessionId, ...(agentId ? { agentId } : {}) },
      );
    },
    async runAgent(args) {
      const notificationToken = createNotificationToken();
      const payload: Record<string, unknown> = {
        stream: true,
        notificationToken,
      };

      if (args.input !== undefined) {
        payload.input = args.input;
      } else if (args.message !== undefined) {
        payload.message = args.message;
      }
      if (args.sessionId) {
        payload.sessionId = args.sessionId;
      }
      if (args.agentId) {
        payload.agentId = args.agentId;
      }

      return callCodefleetToolStream<AgentRunResult>(
        options,
        'agent.run',
        { arguments: payload },
        {
          signal: args.signal,
          onNotification: (message) => {
            if (message.method !== 'agent/stream-response') return;
            const params =
              message.params && typeof message.params === 'object'
                ? (message.params as Record<string, unknown>)
                : null;
            const token = params?.notificationToken ?? params?.notification_token;
            if (typeof token === 'string' && token !== notificationToken) return;
            args.onStreamEvent?.(message);
          },
        },
      );
    },
    async listDocumentsTree() {
      return createSharedClient(options).documents.listDocumentsTree();
    },
    async getDocumentFile(path) {
      return createSharedClient(options).documents.getDocumentFile(path);
    },
    async saveDocumentFile(args) {
      return createSharedClient(options).documents.saveDocumentFile(args);
    },
    async watchDocuments(args) {
      return createSharedClient(options).documents.watchDocuments(args);
    },
    getDocumentAssetUrl(path) {
      return createSharedClient(options).documents.getDocumentAssetUrl(path);
    },
  };
}
