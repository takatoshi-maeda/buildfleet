import { describe, expect, it, vi } from "vitest";
import { runFleetUpPreflight } from "../src/cli/commands/fleetctl.js";

describe("runFleetUpPreflight", () => {
  it("resets in-progress backlog and hard-resets git when both are confirmed", async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const emit = vi.fn();
    const resetInProgressToTodo = vi.fn().mockResolvedValue({
      updatedEpicIds: ["E-001"],
      updatedItemIds: ["I-001"],
    });
    const hardReset = vi.fn().mockResolvedValue(undefined);
    const hasUncommittedChanges = vi.fn().mockResolvedValue(true);

    await runFleetUpPreflight({
      backlogService: {
        list: async () => ({
          epics: [{ id: "E-001", status: "in-progress" }],
          items: [{ id: "I-001", status: "in-progress" }],
        }),
        resetInProgressToTodo,
      },
      confirm,
      hasUncommittedChanges,
      hardReset,
      emit,
    });

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(confirm.mock.calls[1]?.[0]).toContain("git reset --hard && git clean -fd");
    expect(resetInProgressToTodo).toHaveBeenCalledTimes(1);
    expect(hardReset).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "fleet.preflight.backlog_in_progress_reset",
        updatedEpicCount: 1,
        updatedItemCount: 1,
      }),
    );
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "fleet.preflight.git_reset_hard",
      }),
    );
  });

  it("cancels startup when backlog reset confirmation is declined", async () => {
    const confirm = vi.fn().mockResolvedValue(false);

    await expect(
      runFleetUpPreflight({
        backlogService: {
          list: async () => ({
            epics: [{ id: "E-001", status: "in-progress" }],
            items: [],
          }),
          resetInProgressToTodo: vi.fn(),
        },
        confirm,
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
        hardReset: vi.fn(),
        emit: vi.fn(),
      }),
    ).rejects.toThrow(/backlog in-progress reset was not confirmed/u);
  });

  it("continues startup and logs warnings when confirmation is unavailable (non-interactive)", async () => {
    const emit = vi.fn();
    const resetInProgressToTodo = vi.fn();
    const hardReset = vi.fn();

    await runFleetUpPreflight({
      backlogService: {
        list: async () => ({
          epics: [{ id: "E-001", status: "in-progress" }],
          items: [{ id: "I-001", status: "in-progress" }],
        }),
        resetInProgressToTodo,
      },
      confirm: vi.fn().mockResolvedValue(null),
      hasUncommittedChanges: vi.fn().mockResolvedValue(true),
      hardReset,
      emit,
    });

    expect(resetInProgressToTodo).not.toHaveBeenCalled();
    expect(hardReset).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "fleet.preflight.backlog_in_progress_reset.skipped_non_interactive",
      }),
    );
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "fleet.preflight.git_reset_hard.skipped_non_interactive",
      }),
    );
  });
});
