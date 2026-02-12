import { describe, expect, it } from "vitest";
import { getAgentRoleDefinition, isRoleSubscribedToEvent } from "../src/domain/agents/agent-role-definitions.js";

describe("agent-role-definitions", () => {
  it("keeps event subscriptions by role", () => {
    expect(getAgentRoleDefinition("Orchestrator").role).toBe("Orchestrator");
    expect(getAgentRoleDefinition("Developer").role).toBe("Developer");
    expect(getAgentRoleDefinition("Gatekeeper").role).toBe("Gatekeeper");

    expect(isRoleSubscribedToEvent("Orchestrator", { type: "docs.update", paths: ["docs/a.md"] })).toBe(false);
    expect(isRoleSubscribedToEvent("Developer", { type: "docs.update", paths: ["docs/a.md"] })).toBe(false);
    expect(isRoleSubscribedToEvent("Gatekeeper", { type: "docs.update", paths: ["docs/a.md"] })).toBe(true);
  });
});
