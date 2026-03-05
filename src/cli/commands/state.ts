import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Command } from "commander";

const DEFAULT_STATE_DIR = ".codefleet";
const ARCHIVES_DIRNAME = "archives";

interface StateCommandDeps {
  resolveGitCommitHash?: () => Promise<string>;
  createZipArchive?: (input: { outputPath: string; sourcePath: string; excludePatterns: string[] }) => Promise<void>;
}

export function createStateCommand(deps: StateCommandDeps = {}): Command {
  const resolveCommitHash = deps.resolveGitCommitHash ?? resolveGitCommitHash;
  const createArchive = deps.createZipArchive ?? createZipArchive;

  const cmd = new Command("state");
  cmd.description("Manage local .codefleet state");

  cmd
    .command("archive")
    .description("Archive current .codefleet state into .codefleet/archives/<git-commit-hash>.zip")
    .action(async () => {
      const stateDir = path.join(process.cwd(), DEFAULT_STATE_DIR);
      await assertDirectoryExists(stateDir);

      const commitHash = await resolveCommitHash();
      const archivesDir = path.join(stateDir, ARCHIVES_DIRNAME);
      await fs.mkdir(archivesDir, { recursive: true });

      const outputPath = path.join(archivesDir, `${commitHash}.zip`);
      // Excluding the archives subtree prevents recursive growth where each archive
      // would otherwise include prior archive files (and potentially itself).
      await createArchive({
        outputPath,
        sourcePath: DEFAULT_STATE_DIR,
        excludePatterns: [`.codefleet/${ARCHIVES_DIRNAME}`, `.codefleet/${ARCHIVES_DIRNAME}/*`],
      });

      console.log(`created ${path.relative(process.cwd(), outputPath)}`);
    });

  return cmd;
}

async function assertDirectoryExists(directoryPath: string): Promise<void> {
  const stats = await fs.stat(directoryPath).catch((error) => {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      throw new Error(`${path.relative(process.cwd(), directoryPath)} does not exist`);
    }
    throw error;
  });
  if (!stats.isDirectory()) {
    throw new Error(`${path.relative(process.cwd(), directoryPath)} is not a directory`);
  }
}

async function resolveGitCommitHash(): Promise<string> {
  const { stdout } = await runCommand("git", ["rev-parse", "--verify", "HEAD"]);
  const hash = stdout.trim();
  if (!/^[a-f0-9]{40}$/u.test(hash)) {
    throw new Error(`unexpected git commit hash: ${hash}`);
  }
  return hash;
}

async function createZipArchive(input: {
  outputPath: string;
  sourcePath: string;
  excludePatterns: string[];
}): Promise<void> {
  const outputPath = path.resolve(input.outputPath);
  const args = ["-r", "-q", outputPath, input.sourcePath];
  for (const pattern of input.excludePatterns) {
    args.push("-x", pattern);
  }
  await runCommand("zip", args);
}

async function runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      reject(error);
    });
    child.once("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const detail = stderr.trim().length > 0 ? stderr.trim() : `exit ${code ?? "unknown"}`;
      reject(new Error(`${command} failed: ${detail}`));
    });
  });
}
