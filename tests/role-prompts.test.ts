import { describe, expect, it } from "vitest";
import { getRoleEventPromptTemplate, getRoleStartupPrompt } from "../src/domain/fleet/role-prompts.js";

describe("role prompts", () => {
  it("requires Source Brief implementation constraints in curator prompts", async () => {
    const startupPrompt = await getRoleStartupPrompt("Curator");
    const eventPrompt = await getRoleEventPromptTemplate("Curator", "source-brief.update");

    expect(startupPrompt).toContain("Implementation Constraints");
    expect(startupPrompt).toContain("Write the `Implementation Constraints` section in English");
    expect(eventPrompt).toContain("Implementation Constraints");
    expect(eventPrompt).toContain("Write the `Implementation Constraints` section in English");
  });

  it("treats implementation constraints as normative in gatekeeper planning", async () => {
    const eventPrompt = await getRoleEventPromptTemplate("Gatekeeper", "acceptance-test.update");

    expect(eventPrompt).toContain("Implementation Constraints");
    expect(eventPrompt).toContain("normative implementation guidance");
  });
});
