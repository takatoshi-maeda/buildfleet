import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createFeedbackNoteAgentTools } from "../src/agents/tools/feedback-note-agent-tools.js";

describe("feedback note agent tools", () => {
  it("creates a feedback note and lists it from storage", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-feedback-notes-"));
    const tools = createFeedbackNoteAgentTools(tempDir);
    const createTool = tools.find((tool) => tool.name === "feedback_note_create");
    const listTool = tools.find((tool) => tool.name === "feedback_note_list");

    expect(createTool).toBeDefined();
    expect(listTool).toBeDefined();

    const createResult = (await createTool?.execute?.({
      summary: "CLI output is hard to read",
      details: "Long JSON blobs should be summarized by default.",
      tags: ["ux", "cli"],
      priority: "high",
      reporter: "test-user",
    })) as { note?: { id: string; summary: string; tags: string[]; priority: string }; path?: string };

    expect(createResult.note?.id).toBeTruthy();
    expect(createResult.note?.summary).toBe("CLI output is hard to read");
    expect(createResult.note?.tags).toEqual(["ux", "cli"]);
    expect(createResult.note?.priority).toBe("high");
    expect(createResult.path).toBeDefined();
    expect(createResult.path?.endsWith(".md")).toBe(true);
    const files = await fs.readdir(tempDir);
    expect(files.some((file) => file.endsWith(".md"))).toBe(true);

    const listResult = (await listTool?.execute?.({ tag: "ux", limit: 10 })) as {
      notes?: Array<{ id: string; summary: string; reporter: string | null }>;
      count?: number;
    };
    expect(listResult.count).toBe(1);
    expect(listResult.notes?.[0]?.summary).toBe("CLI output is hard to read");
    expect(listResult.notes?.[0]?.reporter).toBe("test-user");
  });

  it("publishes feedback-note.create after creating a note", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-feedback-notes-"));
    const publishFeedbackNoteCreated = vi.fn(async () => ({ enqueuedAgentIds: ["orchestrator-1"] }));
    const tools = createFeedbackNoteAgentTools({
      notesDir: path.join(tempDir, ".codefleet/data/feedback-notes"),
      projectRootDir: tempDir,
      eventPublisher: {
        publishFeedbackNoteCreated,
      },
    });
    const createTool = tools.find((tool) => tool.name === "feedback_note_create");

    const createResult = (await createTool?.execute?.({
      summary: "Need better summaries",
      details: "Front-desk should notify Orchestrator immediately after capture.",
    })) as {
      event?: { type: string; path: string; status: string; enqueuedAgentIds?: string[]; error?: string } | null;
    };

    expect(publishFeedbackNoteCreated).toHaveBeenCalledTimes(1);
    expect(publishFeedbackNoteCreated.mock.calls[0]?.[0]).toMatch(
      /^\.codefleet\/data\/feedback-notes\/[0-9A-HJKMNP-TV-Z]{26}\.md$/u,
    );
    expect(createResult.event).toEqual({
      type: "feedback-note.create",
      path: expect.stringMatching(/^\.codefleet\/data\/feedback-notes\/[0-9A-HJKMNP-TV-Z]{26}\.md$/u),
      status: "enqueued",
      enqueuedAgentIds: ["orchestrator-1"],
    });
  });

  it("keeps note creation successful even when event publish fails", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codefleet-feedback-notes-"));
    const tools = createFeedbackNoteAgentTools({
      notesDir: path.join(tempDir, ".codefleet/data/feedback-notes"),
      projectRootDir: tempDir,
      eventPublisher: {
        publishFeedbackNoteCreated: async () => {
          throw new Error("queue unavailable");
        },
      },
    });
    const createTool = tools.find((tool) => tool.name === "feedback_note_create");

    const createResult = (await createTool?.execute?.({
      summary: "Queue is flaky",
      details: "Keep the note persisted for retry.",
    })) as { path?: string; event?: { status: string; error?: string } | null };

    expect(createResult.path?.endsWith(".md")).toBe(true);
    expect(createResult.event?.status).toBe("failed");
    expect(createResult.event?.error).toContain("queue unavailable");
  });
});
