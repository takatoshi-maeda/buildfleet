import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_RUNTIME_DIR = ".codefleet/runtime";
const EVENT_QUEUE_ROOT = "events/agents";

export interface ConsumeAgentQueueInput {
  agentId: string;
  maxMessages: number;
}

export interface ConsumeAgentQueueResult {
  consumed: number;
  doneFiles: string[];
  failedFiles: string[];
}

export class AgentEventQueueWorkerService {
  constructor(private readonly runtimeDir: string = DEFAULT_RUNTIME_DIR) {}

  async consume(input: ConsumeAgentQueueInput): Promise<ConsumeAgentQueueResult> {
    if (!Number.isInteger(input.maxMessages) || input.maxMessages <= 0) {
      throw new Error("maxMessages must be a positive integer");
    }

    const queueDirs = this.buildQueueDirs(input.agentId);
    await fs.mkdir(queueDirs.pending, { recursive: true });
    await fs.mkdir(queueDirs.processing, { recursive: true });
    await fs.mkdir(queueDirs.done, { recursive: true });
    await fs.mkdir(queueDirs.failed, { recursive: true });

    const pendingFiles = (await fs.readdir(queueDirs.pending))
      .filter((entry) => entry.endsWith(".json"))
      .sort()
      .slice(0, input.maxMessages);

    const doneFiles: string[] = [];
    const failedFiles: string[] = [];

    for (const fileName of pendingFiles) {
      const claimed = await this.claimPendingFile(queueDirs.pending, queueDirs.processing, fileName);
      if (!claimed) {
        continue;
      }

      const processingPath = path.join(queueDirs.processing, fileName);
      try {
        await validateQueueMessage(processingPath);
        const donePath = path.join(queueDirs.done, fileName);
        await fs.rename(processingPath, donePath);
        doneFiles.push(donePath);
      } catch {
        const failedPath = path.join(queueDirs.failed, fileName);
        await fs.rename(processingPath, failedPath);
        failedFiles.push(failedPath);
      }
    }

    return {
      consumed: doneFiles.length + failedFiles.length,
      doneFiles,
      failedFiles,
    };
  }

  private buildQueueDirs(agentId: string): { pending: string; processing: string; done: string; failed: string } {
    const base = path.join(this.runtimeDir, EVENT_QUEUE_ROOT, agentId);
    return {
      pending: path.join(base, "pending"),
      processing: path.join(base, "processing"),
      done: path.join(base, "done"),
      failed: path.join(base, "failed"),
    };
  }

  private async claimPendingFile(pendingDir: string, processingDir: string, fileName: string): Promise<boolean> {
    const sourcePath = path.join(pendingDir, fileName);
    const processingPath = path.join(processingDir, fileName);

    try {
      await fs.rename(sourcePath, processingPath);
      return true;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }
}

async function validateQueueMessage(filePath: string): Promise<void> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("queue message must be an object");
  }
}
