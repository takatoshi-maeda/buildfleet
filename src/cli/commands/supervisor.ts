import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";

interface SupervisorConfigFleet {
  cwd: string;
}

interface SupervisorConfig {
  version?: number;
  fleets: SupervisorConfigFleet[];
}

interface SupervisorCommandOptions {
  loadConfig?: (configPath: string) => Promise<{ configPath: string; fleets: string[] }>;
  runFleetCommand?: (input: { cwd: string; args: string[] }) => Promise<SupervisorFleetExecutionResult>;
}

interface SupervisorFleetExecutionResult {
  cwd: string;
  args: string[];
  ok: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: string;
}

interface SupervisorExecutionSummary {
  total: number;
  succeeded: number;
  failed: number;
}

const DEFAULT_SUPERVISOR_CONFIG_FILE = "default.json";
const SUPERVISOR_CONFIG_DIRNAME = path.join("codefleet", "supervisor");

export function createSupervisorCommand(options: SupervisorCommandOptions = {}): Command {
  const loadConfig = options.loadConfig ?? loadSupervisorConfig;
  const runFleetCommand = options.runFleetCommand ?? runLocalCodefleetCommand;

  const cmd = new Command("supervisor");
  cmd.description("Manage multiple fleets from a shared config file");

  cmd
    .command("up")
    .description("Start all fleets from supervisor config")
    .option("--config <path>", "Path to supervisor config JSON")
    .action(async (parsedOptions: { config?: string }) => {
      const { configPath, fleets } = await loadConfig(resolveSupervisorConfigPath(parsedOptions.config));
      const results = await executeAcrossFleets(fleets, (cwd) =>
        runFleetCommand({ cwd, args: ["up", "--detached", "--skip-startup-preflight"] }),
      );
      const output = {
        command: "up",
        configPath,
        summary: summarizeExecutions(results),
        fleets: sanitizeResults(results),
      };
      console.log(JSON.stringify(output, null, 2));
      if (output.summary.failed > 0) {
        process.exitCode = 1;
      }
    });

  cmd
    .command("down")
    .description("Stop all fleets from supervisor config")
    .option("--config <path>", "Path to supervisor config JSON")
    .action(async (parsedOptions: { config?: string }) => {
      const { configPath, fleets } = await loadConfig(resolveSupervisorConfigPath(parsedOptions.config));
      const results = await executeAcrossFleets(fleets, (cwd) => runFleetCommand({ cwd, args: ["down", "--all"] }));
      const output = {
        command: "down",
        configPath,
        summary: summarizeExecutions(results),
        fleets: sanitizeResults(results),
      };
      console.log(JSON.stringify(output, null, 2));
      if (output.summary.failed > 0) {
        process.exitCode = 1;
      }
    });

  cmd
    .command("status")
    .description("Collect status from all fleets in supervisor config")
    .option("--config <path>", "Path to supervisor config JSON")
    .action(async (parsedOptions: { config?: string }) => {
      const { configPath, fleets } = await loadConfig(resolveSupervisorConfigPath(parsedOptions.config));
      const results = await executeAcrossFleets(fleets, (cwd) => runFleetCommand({ cwd, args: ["status"] }));
      const output = {
        command: "status",
        configPath,
        summary: summarizeExecutions(results),
        fleets: sanitizeResults(results, { parseStatus: true }),
      };
      console.log(JSON.stringify(output, null, 2));
      if (output.summary.failed > 0) {
        process.exitCode = 1;
      }
    });

  return cmd;
}

export function resolveSupervisorConfigPath(explicitPath?: string): string {
  if (explicitPath && explicitPath.trim().length > 0) {
    return path.resolve(explicitPath);
  }

  const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
  const configRoot =
    xdgConfigHome && xdgConfigHome.length > 0 ? xdgConfigHome : path.join(os.homedir(), ".config");
  return path.join(configRoot, SUPERVISOR_CONFIG_DIRNAME, DEFAULT_SUPERVISOR_CONFIG_FILE);
}

export async function loadSupervisorConfig(configPath: string): Promise<{ configPath: string; fleets: string[] }> {
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const config = parseSupervisorConfig(parsed, configPath);

  const deduped = new Set<string>();
  const fleets: string[] = [];
  for (const fleet of config.fleets) {
    const absoluteCwd = path.resolve(fleet.cwd);
    if (deduped.has(absoluteCwd)) {
      continue;
    }
    deduped.add(absoluteCwd);

    const stats = await fs.stat(absoluteCwd).catch((error) => {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        throw new Error(`supervisor config fleet path does not exist: ${absoluteCwd}`);
      }
      throw error;
    });
    if (!stats.isDirectory()) {
      throw new Error(`supervisor config fleet path is not a directory: ${absoluteCwd}`);
    }
    fleets.push(absoluteCwd);
  }

  if (fleets.length === 0) {
    throw new Error(`supervisor config must include at least one fleet: ${configPath}`);
  }

  return { configPath, fleets };
}

function parseSupervisorConfig(input: unknown, configPath: string): SupervisorConfig {
  if (!input || typeof input !== "object") {
    throw new Error(`invalid supervisor config: expected object at ${configPath}`);
  }

  const payload = input as Record<string, unknown>;
  if (payload.version !== undefined && (typeof payload.version !== "number" || !Number.isFinite(payload.version))) {
    throw new Error(`invalid supervisor config: version must be a finite number at ${configPath}`);
  }

  if (!Array.isArray(payload.fleets)) {
    throw new Error(`invalid supervisor config: fleets must be an array at ${configPath}`);
  }

  const fleets: SupervisorConfigFleet[] = payload.fleets.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`invalid supervisor config: fleets[${index}] must be an object at ${configPath}`);
    }
    const record = entry as Record<string, unknown>;
    const cwd = typeof record.cwd === "string" ? record.cwd.trim() : "";
    if (cwd.length === 0) {
      throw new Error(`invalid supervisor config: fleets[${index}].cwd must be a non-empty string at ${configPath}`);
    }
    return { cwd };
  });

  return {
    ...(payload.version !== undefined ? { version: payload.version as number } : {}),
    fleets,
  };
}

async function executeAcrossFleets(
  fleets: string[],
  run: (cwd: string) => Promise<SupervisorFleetExecutionResult>,
): Promise<SupervisorFleetExecutionResult[]> {
  // Fleetごとの失敗を隔離し、他ディレクトリの実行結果を常に返せるようにする。
  const executions = await Promise.allSettled(fleets.map((cwd) => run(cwd)));
  return executions.map((settled, index) => {
    if (settled.status === "fulfilled") {
      return settled.value;
    }

    return {
      cwd: fleets[index] ?? "",
      args: [],
      ok: false,
      exitCode: null,
      signal: null,
      stdout: "",
      stderr: "",
      error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
    };
  });
}

function summarizeExecutions(results: SupervisorFleetExecutionResult[]): SupervisorExecutionSummary {
  const succeeded = results.filter((result) => result.ok).length;
  return {
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
  };
}

function sanitizeResults(
  results: SupervisorFleetExecutionResult[],
  options: { parseStatus?: boolean } = {},
): Array<Record<string, unknown>> {
  return results.map((result) => {
    const base: Record<string, unknown> = {
      cwd: result.cwd,
      ok: result.ok,
      exitCode: result.exitCode,
      signal: result.signal,
      args: result.args,
    };

    if (options.parseStatus) {
      const parsedStatus = parseJsonIfPossible(result.stdout);
      if (parsedStatus !== null) {
        base.status = parsedStatus;
      }
    }

    if (!result.ok) {
      if (result.error) {
        base.error = result.error;
      }
      if (result.stderr.trim().length > 0) {
        base.stderr = result.stderr.trim();
      }
      if (result.stdout.trim().length > 0 && !options.parseStatus) {
        base.stdout = result.stdout.trim();
      }
    }

    return base;
  });
}

async function runLocalCodefleetCommand(input: {
  cwd: string;
  args: string[];
}): Promise<SupervisorFleetExecutionResult> {
  // 現在のCLIエントリポイントを再利用し、配布版(dist)と開発実行(tsx)の両方で
  // 同じ `codefleet` 実体へ委譲する。
  // 開発環境では wrapper が `--import <tsx-loader>` を付けて `src/cli/codefleet.ts` を
  // 起動するため、execArgv を引き継がないと `.ts` を直接実行して失敗する。
  const commandArgs = [...process.execArgv, process.argv[1] ?? "", ...input.args].filter((arg) => arg.length > 0);
  if (commandArgs.length === 0) {
    throw new Error("failed to resolve codefleet entrypoint for supervisor");
  }

  const child = spawn(process.execPath, commandArgs, {
    cwd: input.cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  child.stdout?.on("data", (chunk: Buffer) => {
    stdoutChunks.push(chunk.toString("utf8"));
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk.toString("utf8"));
  });

  const outcome = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null; error?: string }>((resolve) => {
    child.once("error", (error) => {
      resolve({
        exitCode: null,
        signal: null,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    child.once("exit", (code, signal) => {
      resolve({ exitCode: code, signal });
    });
  });

  const stdout = stdoutChunks.join("");
  const stderr = stderrChunks.join("");
  const ok = !outcome.error && outcome.exitCode === 0;

  return {
    cwd: input.cwd,
    args: input.args,
    ok,
    exitCode: outcome.exitCode,
    signal: outcome.signal,
    stdout,
    stderr,
    ...(outcome.error ? { error: outcome.error } : {}),
  };
}

function parseJsonIfPossible(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}
