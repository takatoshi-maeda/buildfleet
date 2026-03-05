import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStateCommand } from "../src/cli/commands/state.js";

describe("state command", () => {
  const originalCwd = process.cwd();
  const tempDirs: string[] = [];

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
  });

  it("archives .codefleet state into .codefleet/archives/<hash>.zip", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "codefleet-state-archive-"));
    tempDirs.push(tempDir);
    process.chdir(tempDir);
    await mkdir(path.join(tempDir, ".codefleet", "runtime"), { recursive: true });

    const resolveGitCommitHash = vi.fn(async () => "0123456789abcdef0123456789abcdef01234567");
    const createZipArchive = vi.fn(async () => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const root = new Command();
    root.addCommand(createStateCommand({ resolveGitCommitHash, createZipArchive }));
    await root.parseAsync(["state", "archive"], { from: "user" });

    expect(resolveGitCommitHash).toHaveBeenCalledTimes(1);
    expect(createZipArchive).toHaveBeenCalledWith({
      outputPath: path.join(tempDir, ".codefleet", "archives", "0123456789abcdef0123456789abcdef01234567.zip"),
      sourcePath: ".codefleet",
      excludePatterns: [".codefleet/archives", ".codefleet/archives/*"],
    });
    expect(logSpy).toHaveBeenCalledWith(
      "created .codefleet/archives/0123456789abcdef0123456789abcdef01234567.zip",
    );
  });

  it("fails when .codefleet directory is missing", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "codefleet-state-archive-"));
    tempDirs.push(tempDir);
    process.chdir(tempDir);

    const root = new Command();
    root.addCommand(createStateCommand({ resolveGitCommitHash: async () => "unused", createZipArchive: async () => undefined }));

    await expect(root.parseAsync(["state", "archive"], { from: "user" })).rejects.toThrow(".codefleet does not exist");
  });
});
