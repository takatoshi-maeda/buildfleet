import type { AgentProviderId, RoleAgentRuntime } from "./role-agent-runtime.js";

export interface AgentRuntimeResolver {
  resolve(provider: AgentProviderId): RoleAgentRuntime;
}

export class StaticAgentRuntimeResolver implements AgentRuntimeResolver {
  constructor(private readonly runtimes: Map<AgentProviderId, RoleAgentRuntime>) {}

  resolve(provider: AgentProviderId): RoleAgentRuntime {
    const runtime = this.runtimes.get(provider);
    if (!runtime) {
      throw new Error(`runtime provider is not registered: ${provider}`);
    }
    return runtime;
  }
}
