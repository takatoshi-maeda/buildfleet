import { promises as fs } from "node:fs";
import path from "node:path";

export interface McpToolAuditLogEntry {
  ts: string;
  agent: string;
  tool: string;
  input: Record<string, unknown>;
  durationMs: number;
  isError: boolean;
  resultCount?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface McpToolAuditLogger {
  log(entry: McpToolAuditLogEntry): Promise<void>;
}

export class JsonlMcpToolAuditLogger implements McpToolAuditLogger {
  constructor(private readonly filePath: string) {}

  async log(entry: McpToolAuditLogEntry): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
  }
}
