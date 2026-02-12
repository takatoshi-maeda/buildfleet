import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { createAcceptanceTestCli } from "../src/cli/codefleet-acceptance-test.js";
import { createBacklogCli } from "../src/cli/codefleet-backlog.js";
import { createCodefleetCli } from "../src/cli/codefleet.js";

async function renderHelp(command: Command): Promise<string> {
  let output = "";

  command
    .exitOverride()
    .configureOutput({
      writeOut: (str) => {
        output += str;
      },
      writeErr: (str) => {
        output += str;
      },
    });

  try {
    await command.parseAsync(["--help"], { from: "user" });
  } catch {
    // `--help` exits intentionally.
  }

  return output;
}

describe("CLI command layout", () => {
  it("keeps fleet control on codefleet and leaves init as subcommand", async () => {
    const output = await renderHelp(createCodefleetCli());

    expect(output).toContain("codefleet [options] [command]");
    expect(output).toContain("status");
    expect(output).toContain("up");
    expect(output).toContain("down");
    expect(output).toContain("restart");
    expect(output).toContain("logs");
    expect(output).toContain("init");
    expect(output).toContain("trigger");
    expect(output).not.toContain("acceptance-test");
    expect(output).not.toContain("backlog");
  });

  it("exposes acceptance-test as standalone binary", async () => {
    const output = await renderHelp(createAcceptanceTestCli());

    expect(output).toContain("codefleet-acceptance-test [options] [command]");
    expect(output).toContain("result");
    expect(output).toContain("list");
    expect(output).toContain("clear");
  });

  it("exposes backlog as standalone binary", async () => {
    const output = await renderHelp(createBacklogCli());

    expect(output).toContain("codefleet-backlog [options] [command]");
    expect(output).toContain("epic");
    expect(output).toContain("item");
    expect(output).toContain("list");
  });
});
