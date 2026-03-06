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

export type JsonRpcId = string | number;

export type JsonRpcNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

export type StreamRequestOptions = {
  signal?: AbortSignal;
  onNotification?: (message: JsonRpcNotification) => void;
};

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

const initPromiseByKey = new Map<string, Promise<void>>();
let requestCounter = 0;

function nextRequestId(): JsonRpcId {
  requestCounter += 1;
  return `mcp-${Date.now().toString(16)}-${requestCounter}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function parseSseEventBlock(block: string): string | null {
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  return dataLines.length > 0 ? dataLines.join('\n') : null;
}

function getEndpoints(baseUrl: string, agentName: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  return {
    init: `${normalized}/api/mcp/${agentName}`,
    toolCall: (toolName: string) =>
      `${normalized}/api/mcp/${agentName}/tools/call/${toolName}`,
    status: `${normalized}/api/codefleet/status`,
  } as const;
}

async function sendNotification(
  endpoint: string,
  protocolVersion: string,
  message: JsonRpcNotification,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': protocolVersion,
    },
    body: JSON.stringify(message),
    signal,
  });
  if (!response.ok) {
    throw new Error(`MCP notification failed: HTTP ${response.status}`);
  }
}

async function sendJsonRequestTo(
  endpoint: string,
  protocolVersion: string,
  message: unknown,
  options: StreamRequestOptions = {},
): Promise<JsonRpcResponse> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'MCP-Protocol-Version': protocolVersion,
    },
    body: JSON.stringify(message),
    signal: options.signal,
  });
  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
    const messageText =
      typeof errorPayload.error === 'string' && errorPayload.error.trim().length > 0
        ? errorPayload.error
        : `HTTP ${response.status}`;
    throw new Error(messageText);
  }
  return (await response.json()) as JsonRpcResponse;
}

async function sendStreamableRequestTo(
  endpoint: string,
  protocolVersion: string,
  message: unknown,
  options: StreamRequestOptions = {},
  expectedId?: JsonRpcId | null,
): Promise<JsonRpcResponse> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
      'MCP-Protocol-Version': protocolVersion,
    },
    body: JSON.stringify(message),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
    const messageText =
      typeof errorPayload.error === 'string' && errorPayload.error.trim().length > 0
        ? errorPayload.error
        : `HTTP ${response.status}`;
    throw new Error(messageText);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as JsonRpcResponse;
  }

  const body = response.body;
  if (!body) {
    throw new Error('MCP response stream was not available.');
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let responseMessage: JsonRpcResponse | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundaryIndex = buffer.indexOf('\n\n');
      while (boundaryIndex >= 0) {
        const block = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        const data = parseSseEventBlock(block);
        if (!data) {
          boundaryIndex = buffer.indexOf('\n\n');
          continue;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = null;
        }
        if (!parsed || typeof parsed !== 'object') {
          boundaryIndex = buffer.indexOf('\n\n');
          continue;
        }

        const candidate = parsed as JsonRpcResponse | JsonRpcNotification;
        if ('id' in candidate) {
          if (
            responseMessage === null &&
            (expectedId === undefined || expectedId === null || candidate.id === expectedId)
          ) {
            responseMessage = candidate as JsonRpcResponse;
          }
        } else if ('method' in candidate) {
          options.onNotification?.(candidate as JsonRpcNotification);
        }

        boundaryIndex = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!responseMessage) {
    throw new Error('MCP response did not include a result.');
  }
  return responseMessage;
}

function extractStructuredResult(result: unknown): unknown {
  if (!result || typeof result !== 'object') {
    return result;
  }
  const record = result as Record<string, unknown>;
  if (record.structuredContent !== undefined) {
    return record.structuredContent;
  }
  const content = record.content;
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0] as Record<string, unknown> | undefined;
    if (first && typeof first === 'object' && typeof first.text === 'string') {
      try {
        return JSON.parse(first.text);
      } catch {
        return first.text;
      }
    }
  }
  return result;
}

async function ensureInitialized(
  baseUrl: string,
  agentName: string,
  protocolVersion: string,
  clientInfo: { name: string; version: string },
  signal?: AbortSignal,
): Promise<void> {
  const endpoints = getEndpoints(baseUrl, agentName);
  const initKey = `${agentName}@@${endpoints.init}`;
  const existing = initPromiseByKey.get(initKey);
  if (!existing) {
    const initPromise = (async () => {
      try {
        const initRequest = {
          jsonrpc: '2.0' as const,
          id: nextRequestId(),
          method: 'initialize',
          params: {
            protocolVersion,
            capabilities: {},
            clientInfo,
          },
        };
        await sendStreamableRequestTo(
          endpoints.init,
          protocolVersion,
          initRequest,
          { signal },
          initRequest.id,
        );
        await sendNotification(
          endpoints.init,
          protocolVersion,
          { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
          signal,
        );
      } catch (error) {
        initPromiseByKey.delete(initKey);
        throw error;
      }
    })();
    initPromiseByKey.set(initKey, initPromise);
  }

  const activeInitPromise = initPromiseByKey.get(initKey);
  if (!activeInitPromise) {
    throw new Error(`MCP initialization state missing for agent: ${agentName}`);
  }
  return activeInitPromise;
}

async function callTool<T>(
  toolName: string,
  args: Record<string, unknown>,
  options: StreamRequestOptions,
  config: {
    baseUrl: string;
    agentName: string;
    protocolVersion: string;
    clientInfo: { name: string; version: string };
  },
  mode: 'json' | 'stream',
): Promise<T> {
  await ensureInitialized(
    config.baseUrl,
    config.agentName,
    config.protocolVersion,
    config.clientInfo,
    options.signal,
  );
  const endpoint = getEndpoints(config.baseUrl, config.agentName).toolCall(toolName);
  const response =
    mode === 'stream'
      ? await sendStreamableRequestTo(endpoint, config.protocolVersion, args, options, null)
      : await sendJsonRequestTo(endpoint, config.protocolVersion, args, options);

  if (response.error) {
    throw new Error(
      typeof response.error.message === 'string' ? response.error.message : 'MCP error',
    );
  }

  return extractStructuredResult(response.result) as T;
}

export function createCodefleetMcpClient(
  options: CreateCodefleetMcpClientOptions,
): CodefleetClient {
  const agentName = options.agentName ?? 'codefleet.front-desk';
  const protocolVersion = options.protocolVersion ?? MCP_PROTOCOL_VERSION;
  const clientInfo = options.clientInfo ?? {
    name: 'codefleet-ui',
    version: '0.1.0',
  };

  const buildConfig = () => ({
    baseUrl: options.getBaseUrl(),
    agentName,
    protocolVersion,
    clientInfo,
  });

  return {
    async listBacklogEpics() {
      const raw = await callTool<unknown>('backlog.epic.list', {}, {}, buildConfig(), 'json');
      return decodeCodefleetEpicList(raw);
    },
    async getBacklogEpic(id: string) {
      const raw = await callTool<unknown>('backlog.epic.get', { id }, {}, buildConfig(), 'json');
      return decodeCodefleetEpicGet(raw);
    },
    async listBacklogItems() {
      const raw = await callTool<unknown>('backlog.item.list', {}, {}, buildConfig(), 'json');
      return decodeCodefleetItemList(raw);
    },
    async getBacklogItem(id: string) {
      const raw = await callTool<unknown>('backlog.item.get', { id }, {}, buildConfig(), 'json');
      return decodeCodefleetItemGet(raw);
    },
    async watchFleet(args, requestOptions = {}) {
      const raw = await callTool<unknown>(
        'fleet.watch',
        args,
        requestOptions,
        buildConfig(),
        'stream',
      );
      return decodeCodefleetWatchResult(raw);
    },
    async fetchFleetStatus(endpoint: string) {
      const response = await fetch(getEndpoints(endpoint, agentName).status);
      if (!response.ok) return null;
      return (await response.json()) as FleetStatusResponse;
    },
  };
}
