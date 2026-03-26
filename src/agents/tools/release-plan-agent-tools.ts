import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "ai-kit";
import { createUlid } from "../../shared/ulid.js";

const DEFAULT_RELEASE_PLANS_DIR = ".codefleet/data/release-plan";
const DEFAULT_RELEASE_PLAN_DRAFTS_DIR = ".codefleet/runtime/release-plan-drafts";

export interface ReleasePlanEventPublishResult {
  enqueuedAgentIds: string[];
}

export interface ReleasePlanEventPublisher {
  publishReleasePlanCreated(path: string): Promise<ReleasePlanEventPublishResult>;
}

export interface CreateReleasePlanAgentToolsOptions {
  releasePlansDir?: string;
  releasePlanDraftsDir?: string;
  projectRootDir?: string;
  eventPublisher?: ReleasePlanEventPublisher;
}

const ReleasePlanCommitInputSchema = z.object({
  draftPath: z.string().trim().min(1),
});

const ReleasePlanListInputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

interface ReleasePlanRecord {
  id: string;
  createdAt: string;
  version: string;
  content: string;
  title: string | null;
}

type ReleasePlanAgentToolsInput = string | CreateReleasePlanAgentToolsOptions | undefined;

export function createReleasePlanAgentTools(input: ReleasePlanAgentToolsInput = DEFAULT_RELEASE_PLANS_DIR): ToolDefinition[] {
  const options: CreateReleasePlanAgentToolsOptions = typeof input === "string" ? { releasePlansDir: input } : (input ?? {});
  const releasePlansDir = options.releasePlansDir ?? DEFAULT_RELEASE_PLANS_DIR;
  const releasePlanDraftsDir = options.releasePlanDraftsDir ?? DEFAULT_RELEASE_PLAN_DRAFTS_DIR;
  const projectRootDir = options.projectRootDir ?? process.cwd();
  const eventPublisher = options.eventPublisher;

  return [
    {
      name: "release_plan_commit",
      description: "Commit a drafted release plan markdown file into durable storage",
      parameters: ReleasePlanCommitInputSchema,
      execute: async (params) => {
        const input = ReleasePlanCommitInputSchema.parse(params);
        const absoluteDraftPath = resolveProjectFilePath(input.draftPath, projectRootDir);
        assertPathInsideDirectory(absoluteDraftPath, resolveProjectFilePath(releasePlanDraftsDir, projectRootDir), "release plan draft");
        const rawDraft = await fs.readFile(absoluteDraftPath, "utf8");
        const draftContent = rawDraft.trim();
        if (draftContent.length === 0) {
          throw new Error("release plan draft must not be empty");
        }

        const now = new Date();
        const createdAt = now.toISOString();
        const version = formatReleasePlanVersion(now);
        const record: ReleasePlanRecord = {
          id: createUlid(),
          createdAt,
          version,
          content: draftContent,
          title: extractTitleFromMarkdown(draftContent),
        };

        await fs.mkdir(releasePlansDir, { recursive: true });
        const planPath = path.join(releasePlansDir, `${record.version}.md`);
        await fs.writeFile(planPath, serializeReleasePlan(record), "utf8");
        const event = await publishReleasePlanCreated(eventPublisher, planPath, projectRootDir);
        return {
          releasePlan: {
            id: record.id,
            createdAt: record.createdAt,
            version: record.version,
            title: record.title,
          },
          draftPath: toProjectRelativePath(absoluteDraftPath, projectRootDir),
          path: planPath,
          event,
        };
      },
    },
    {
      name: "release_plan_list",
      description: "List stored release plans",
      parameters: ReleasePlanListInputSchema,
      execute: async (params) => {
        const input = ReleasePlanListInputSchema.parse(params ?? {});
        const listed = await readReleasePlans(releasePlansDir);
        const limit = input.limit ?? 20;
        return {
          releasePlans: listed.slice(0, limit),
          count: listed.length,
        };
      },
    },
  ];
}

async function publishReleasePlanCreated(
  eventPublisher: ReleasePlanEventPublisher | undefined,
  planPath: string,
  projectRootDir: string,
): Promise<{
  type: "release-plan.create";
  path: string;
  status: "enqueued" | "failed";
  enqueuedAgentIds?: string[];
  error?: string;
} | null> {
  if (!eventPublisher) {
    return null;
  }

  try {
    const relativePath = toProjectRelativeMarkdownPath(planPath, projectRootDir);
    const result = await eventPublisher.publishReleasePlanCreated(relativePath);
    return {
      type: "release-plan.create",
      path: relativePath,
      status: "enqueued",
      enqueuedAgentIds: result.enqueuedAgentIds,
    };
  } catch (error) {
    return {
      type: "release-plan.create",
      path: planPath,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function toProjectRelativeMarkdownPath(filePath: string, projectRootDir: string): string {
  const relative = toProjectRelativePath(filePath, projectRootDir);
  if (!relative.endsWith(".md")) {
    throw new Error("release plan path must end with .md");
  }
  if (!relative.startsWith(`${DEFAULT_RELEASE_PLANS_DIR}/`)) {
    throw new Error(`release plan path must be inside ${DEFAULT_RELEASE_PLANS_DIR}`);
  }
  return relative;
}

async function readReleasePlans(releasePlansDir: string): Promise<ReleasePlanRecord[]> {
  let files: string[];
  try {
    files = await fs.readdir(releasePlansDir);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const plans = await Promise.all(
    files
      .filter((file) => file.endsWith(".md"))
      .map(async (file) => {
        const raw = await fs.readFile(path.join(releasePlansDir, file), "utf8");
        return parseReleasePlan(raw);
      }),
  );

  return plans.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function parseReleasePlan(raw: string): ReleasePlanRecord {
  const lines = raw.split(/\r?\n/);
  if (lines[0] !== "---") {
    throw new Error("invalid release plan format: missing front matter start");
  }

  const frontMatterEnd = lines.indexOf("---", 1);
  if (frontMatterEnd < 0) {
    throw new Error("invalid release plan format: missing front matter end");
  }

  const frontMatterLines = lines.slice(1, frontMatterEnd);
  const entries = new Map<string, string>();
  for (const line of frontMatterLines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }
    entries.set(line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim());
  }

  const content = lines.slice(frontMatterEnd + 1).join("\n").trim();

  return z.object({
    id: z.string().min(1),
    createdAt: z.string().datetime(),
    version: z.string().regex(/^\d{8}\.\d{6}$/u),
    content: z.string().min(1),
    title: z.string().nullable(),
  }).parse({
    id: entries.get("id"),
    createdAt: entries.get("createdAt"),
    version: entries.get("version"),
    content,
    title: extractTitleFromMarkdown(content),
  });
}

function serializeReleasePlan(plan: ReleasePlanRecord): string {
  return [
    "---",
    `id: ${plan.id}`,
    `createdAt: ${plan.createdAt}`,
    `version: ${plan.version}`,
    "---",
    plan.content,
    "",
  ].join("\n");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

function resolveProjectFilePath(filePath: string, projectRootDir: string): string {
  return path.resolve(projectRootDir, filePath);
}

function assertPathInsideDirectory(filePath: string, directoryPath: string, label: string): void {
  const relative = path.relative(directoryPath, filePath);
  if (
    relative.length === 0 ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  ) {
    return;
  }
  throw new Error(`${label} path must be inside ${directoryPath}`);
}

function toProjectRelativePath(filePath: string, projectRootDir: string): string {
  const relative = path.relative(projectRootDir, filePath).split(path.sep).join("/");
  if (relative.length === 0) {
    throw new Error("path must be non-empty");
  }
  if (relative.includes("..")) {
    throw new Error("path must be inside project root");
  }
  if (relative.startsWith("/") || /^[a-zA-Z]:[\\/]/u.test(relative)) {
    throw new Error("path must be project-root relative");
  }
  return relative;
}

function formatReleasePlanVersion(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  const seconds = String(value.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}.${hours}${minutes}${seconds}`;
}

function extractTitleFromMarkdown(content: string): string | null {
  for (const line of content.split(/\r?\n/)) {
    const match = /^#\s+(.+)$/u.exec(line.trim());
    if (match) {
      return match[1]?.trim() || null;
    }
  }
  return null;
}
