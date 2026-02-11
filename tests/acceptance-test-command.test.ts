import { afterEach, describe, expect, it, vi } from "vitest";
import { createCli } from "../src/cli/index.js";

describe("acceptance-test command", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints role-specific guidance with --help-for-agent", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await createCli().parseAsync(["acceptance-test", "--help-for-agent"], { from: "user" });

    const output = logSpy.mock.calls.map(([line]) => String(line)).join("\n");
    expect(output).toContain("Orchestrator");
    expect(output).toContain("Developer");
    expect(output).toContain("Gatekeeper");
    expect(output).toContain("acceptance-test result add");
  });
});
