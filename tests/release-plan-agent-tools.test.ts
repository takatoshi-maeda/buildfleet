import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createReleasePlanAgentTools } from "../src/agents/tools/release-plan-agent-tools.js";

describe("release plan agent tools", () => {
  it("commits a drafted release plan and lists it from storage", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-release-plans-"));
    const draftDir = path.join(tempDir, ".codefleet/runtime/release-plan-drafts");
    const plansDir = path.join(tempDir, ".codefleet/data/release-plan");
    await fs.mkdir(draftDir, { recursive: true });
    await fs.writeFile(
      path.join(draftDir, "draft.md"),
      "# Improve CLI review flow\n\nRefine review output and reduce noisy logs.\n",
      "utf8",
    );

    const tools = createReleasePlanAgentTools({
      releasePlansDir: plansDir,
      releasePlanDraftsDir: draftDir,
      projectRootDir: tempDir,
    });
    const commitTool = tools.find((tool) => tool.name === "release_plan_commit");
    const listTool = tools.find((tool) => tool.name === "release_plan_list");

    const commitResult = (await commitTool?.execute?.({
      draftPath: ".codefleet/runtime/release-plan-drafts/draft.md",
    })) as {
      releasePlan?: { id: string; title: string | null; version: string; createdAt: string };
      path?: string;
      draftPath?: string;
    };

    expect(commitResult.releasePlan?.id).toBeTruthy();
    expect(commitResult.releasePlan?.title).toBe("Improve CLI review flow");
    expect(commitResult.releasePlan?.version).toMatch(/^\d{8}\.\d{6}$/u);
    expect(commitResult.releasePlan?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    expect(commitResult.draftPath).toBe(".codefleet/runtime/release-plan-drafts/draft.md");
    expect(commitResult.path).toBe(path.join(plansDir, `${commitResult.releasePlan?.version}.md`));

    const saved = await fs.readFile(String(commitResult.path), "utf8");
    expect(saved).toContain(`id: ${commitResult.releasePlan?.id}`);
    expect(saved).toContain(`version: ${commitResult.releasePlan?.version}`);
    expect(saved).toContain("# Improve CLI review flow");

    const listResult = (await listTool?.execute?.({ limit: 10 })) as {
      releasePlans?: Array<{ title: string | null; version: string; content: string }>;
      count?: number;
    };
    expect(listResult.count).toBe(1);
    expect(listResult.releasePlans?.[0]?.title).toBe("Improve CLI review flow");
    expect(listResult.releasePlans?.[0]?.version).toBe(commitResult.releasePlan?.version);
    expect(listResult.releasePlans?.[0]?.content).toContain("Refine review output");
  });

  it("publishes release-plan.create after committing a release plan", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-release-plans-"));
    const draftDir = path.join(tempDir, ".codefleet/runtime/release-plan-drafts");
    await fs.mkdir(draftDir, { recursive: true });
    await fs.writeFile(path.join(draftDir, "draft.md"), "# Plan A\n\nCapture references and outcome expectations.\n", "utf8");

    const publishReleasePlanCreated = vi.fn(async () => ({ enqueuedAgentIds: ["curator-1"] }));
    const tools = createReleasePlanAgentTools({
      releasePlansDir: path.join(tempDir, ".codefleet/data/release-plan"),
      releasePlanDraftsDir: draftDir,
      projectRootDir: tempDir,
      eventPublisher: {
        publishReleasePlanCreated,
      },
    });
    const commitTool = tools.find((tool) => tool.name === "release_plan_commit");

    const commitResult = (await commitTool?.execute?.({
      draftPath: ".codefleet/runtime/release-plan-drafts/draft.md",
    })) as {
      event?: { type: string; path: string; status: string; enqueuedAgentIds?: string[] } | null;
    };

    expect(publishReleasePlanCreated).toHaveBeenCalledTimes(1);
    expect(publishReleasePlanCreated.mock.calls[0]?.[0]).toMatch(
      /^\.codefleet\/data\/release-plan\/\d{8}\.\d{6}\.md$/u,
    );
    expect(commitResult.event).toEqual({
      type: "release-plan.create",
      path: expect.stringMatching(/^\.codefleet\/data\/release-plan\/\d{8}\.\d{6}\.md$/u),
      status: "enqueued",
      enqueuedAgentIds: ["curator-1"],
    });
  });
});
