import type {
  OpenAINativeApplyPatchTool,
  OpenAINativeShellTool,
} from "ai-kit";

export function createOpenAINativeShellTool(
  options: Omit<OpenAINativeShellTool, "kind" | "provider" | "type">,
): OpenAINativeShellTool {
  return {
    kind: "provider_native",
    provider: "openai",
    type: "shell",
    ...options,
  };
}

export function createOpenAINativeApplyPatchTool(
  options: Omit<OpenAINativeApplyPatchTool, "kind" | "provider" | "type">,
): OpenAINativeApplyPatchTool {
  return {
    kind: "provider_native",
    provider: "openai",
    type: "apply_patch",
    ...options,
  };
}
