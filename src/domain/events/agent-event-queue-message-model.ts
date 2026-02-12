import type { SystemEvent } from "../../events/router.js";
import type { AgentRole } from "../roles-model.js";

export interface AgentEventQueueMessage {
  id: string;
  createdAt: string;
  agentId: string;
  agentRole: AgentRole;
  event: SystemEvent;
  source: {
    command: string;
  };
}
