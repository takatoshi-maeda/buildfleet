import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSupervisorCommand,
  loadSupervisorConfig,
  resolveSupervisorConfigPath,
} from "../src/cli/commands/supervisor.js";

describe("supervisor command", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await Promise.all(tempDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
  });

  it("resolves default config path from XDG_CONFIG_HOME", () => {
    vi.stubEnv("XDG_CONFIG_HOME", "/tmp/xdg-home");

    const configPath = resolveSupervisorConfigPath();

    expect(configPath).toBe(path.join("/tmp/xdg-home", "codefleet", "supervisor", "default.json"));
  });

  it("loads fleets from config and deduplicates absolute paths", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "codefleet-supervisor-"));
    tempDirs.push(tempRoot);

    const fleetA = path.join(tempRoot, "fleet-a");
    const fleetB = path.join(tempRoot, "fleet-b");
    await mkdir(fleetA, { recursive: true });
    await mkdir(fleetB, { recursive: true });
    const configPath = path.join(tempRoot, "supervisor.json");
    await writeFile(
      configPath,
      JSON.stringify(
        {
          fleets: [{ cwd: fleetA }, { cwd: path.relative(process.cwd(), fleetB) }, { cwd: fleetA }],
        },
        null,
        2,
      ),
      "utf8",
    );

    const loaded = await loadSupervisorConfig(configPath);

    expect(loaded.fleets).toEqual([path.resolve(fleetA), path.resolve(path.relative(process.cwd(), fleetB))]);
  });

  it("dispatches up to each fleet with detached startup flags", async () => {
    const calls: Array<{ cwd: string; args: string[] }> = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const command = createSupervisorCommand({
      loadConfig: async () => ({ configPath: "/tmp/supervisor.json", fleets: ["/tmp/a", "/tmp/b"] }),
      runFleetCommand: async (input) => {
        calls.push(input);
        return {
          cwd: input.cwd,
          args: input.args,
          ok: true,
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
        };
      },
    });

    await command.parseAsync(["up"], { from: "user" });

    expect(calls).toEqual([
      { cwd: "/tmp/a", args: ["up", "--detached", "--skip-startup-preflight"] },
      { cwd: "/tmp/b", args: ["up", "--detached", "--skip-startup-preflight"] },
    ]);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0]?.[0] ?? "{}")).toMatchObject({
      command: "up",
      summary: { total: 2, succeeded: 2, failed: 0 },
    });
  });

  it("dispatches down --all to each fleet", async () => {
    const calls: Array<{ cwd: string; args: string[] }> = [];

    const command = createSupervisorCommand({
      loadConfig: async () => ({ configPath: "/tmp/supervisor.json", fleets: ["/tmp/a"] }),
      runFleetCommand: async (input) => {
        calls.push(input);
        return {
          cwd: input.cwd,
          args: input.args,
          ok: true,
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
        };
      },
    });

    await command.parseAsync(["down"], { from: "user" });

    expect(calls).toEqual([{ cwd: "/tmp/a", args: ["down", "--all"] }]);
  });

  it("parses status JSON from each fleet", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const command = createSupervisorCommand({
      loadConfig: async () => ({ configPath: "/tmp/supervisor.json", fleets: ["/tmp/a"] }),
      runFleetCommand: async (input) => ({
        cwd: input.cwd,
        args: input.args,
        ok: true,
        exitCode: 0,
        signal: null,
        stdout: JSON.stringify({ summary: { running: 3 } }),
        stderr: "",
      }),
    });

    await command.parseAsync(["status"], { from: "user" });

    expect(JSON.parse(logSpy.mock.calls[0]?.[0] ?? "{}")).toMatchObject({
      command: "status",
      fleets: [{ cwd: "/tmp/a", status: { summary: { running: 3 } } }],
    });
  });

  it("returns non-zero exitCode when any fleet command fails", async () => {
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;

    const command = createSupervisorCommand({
      loadConfig: async () => ({ configPath: "/tmp/supervisor.json", fleets: ["/tmp/a", "/tmp/b"] }),
      runFleetCommand: async (input) => ({
        cwd: input.cwd,
        args: input.args,
        ok: input.cwd === "/tmp/a",
        exitCode: input.cwd === "/tmp/a" ? 0 : 1,
        signal: null,
        stdout: "",
        stderr: input.cwd === "/tmp/a" ? "" : "failure",
      }),
    });

    try {
      await command.parseAsync(["down"], { from: "user" });
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  });
});
