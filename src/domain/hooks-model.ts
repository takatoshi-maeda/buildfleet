import type { AgentRole } from "./roles-model.js";

export type RoleHookPhase = "before_start" | "after_complete" | "after_fail";

export interface RoleHookDefinition {
  before_start?: string | string[];
  after_complete?: string | string[];
  after_fail?: string | string[];
}

export type RoleHooksByAgentRole = Partial<Record<AgentRole, RoleHookDefinition>>;
