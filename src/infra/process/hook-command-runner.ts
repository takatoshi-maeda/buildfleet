import { spawn } from "node:child_process";

export interface HookCommandRunner {
  run(command: string, options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<void>;
}

export class ShellHookCommandRunner implements HookCommandRunner {
  async run(command: string, options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, {
        cwd: options.cwd,
        env: options.env,
        shell: true,
        stdio: "inherit",
      });
      child.once("error", reject);
      child.once("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`hook command failed (exit ${code ?? "unknown"}): ${command}`));
      });
    });
  }
}
