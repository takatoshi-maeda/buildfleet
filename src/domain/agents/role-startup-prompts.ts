import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodefleetError } from "../../shared/errors.js";
import type { AgentRole } from "../roles-model.js";

const PROMPT_FILE_BY_ROLE: Record<AgentRole, string> = {
  Orchestrator: "orchestrator-startup.md",
  Gatekeeper: "gatekeeper-startup.md",
  Developer: "developer-startup.md",
};

const promptCache = new Map<AgentRole, string>();

export async function getRoleStartupPrompt(role: AgentRole): Promise<string> {
  const cached = promptCache.get(role);
  if (cached) {
    return cached;
  }

  const promptPath = path.join(resolveProjectRoot(), "src/prompts", PROMPT_FILE_BY_ROLE[role]);
  try {
    const prompt = await fs.readFile(promptPath, "utf8");
    promptCache.set(role, prompt);
    return prompt;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      throw new CodefleetError("ERR_NOT_FOUND", `startup prompt not found: ${promptPath}`);
    }
    throw error;
  }
}

function resolveProjectRoot(): string {
  // This module is emitted to `dist/domain/agents`; the same traversal from `src` and `dist`
  // reaches repository root, which keeps prompt path resolution stable in dev and build runs.
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..", "..", "..");
}
