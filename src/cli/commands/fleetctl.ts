import { Command } from "commander";
import type { AgentRuntime } from "../../domain/agent-runtime-model.js";
import type { AppServerSession } from "../../domain/app-server-session-model.js";
import type { AgentRole } from "../../domain/roles-model.js";
import { FleetService } from "../../domain/agents/fleet-service.js";

interface FleetctlCommandOptions {
  commandName?: string;
}

export function createFleetctlCommand(options: FleetctlCommandOptions = {}): Command {
  const service = new FleetService();
  const commandName = options.commandName ?? "fleetctl";

  const cmd = new Command(commandName);
  cmd.description("Control codefleet agent processes.");

  cmd
    .command("status")
    .description("Show agent runtime status")
    .option("--role <role>", "Filter by role")
    .action(async (options) => {
      const status = await service.status(options.role as AgentRole | undefined);
      console.log(JSON.stringify(status, null, 2));
    });

  cmd
    .command("up")
    .description("Start agents")
    .option("-d, --detached", "Run in background")
    .option("--gatekeepers <count>", "Number of Gatekeeper agents", "1")
    .option("--developers <count>", "Number of Developer agents", "1")
    .action(async (options) => {
      const requestedAt = new Date().toISOString();
      const gatekeepers = Number(options.gatekeepers);
      const developers = Number(options.developers);
      emitJsonl({
        ts: requestedAt,
        level: "info",
        event: "fleet.up.requested",
        detached: Boolean(options.detached),
        requestedRoles: {
          orchestrators: 1,
          gatekeepers,
          developers,
        },
      });

      const status = await service.up({
        detached: Boolean(options.detached),
        gatekeepers,
        developers,
      });
      for (const agent of status.agents) {
        emitAgentRuntimeLog(agent);
      }

      for (const session of status.sessions) {
        emitSessionLog(session);
      }

      emitJsonl({
        ts: new Date().toISOString(),
        level: "info",
        event: "fleet.up.completed",
        summary: status.summary,
        agentCount: status.agents.length,
        readySessionCount: status.sessions.filter((session) => session.status === "ready").length,
      });

      if (!Boolean(options.detached)) {
        await waitForShutdownSignal(service);
      }
    });

  cmd
    .command("down")
    .description("Stop agents")
    .option("--all", "Stop all agents")
    .option("--role <role>", "Stop agents with the role")
    .action(async (options) => {
      validateTargetSelection(Boolean(options.all), options.role as AgentRole | undefined, "down");
      const status = await service.down({ all: Boolean(options.all), role: options.role as AgentRole | undefined });
      console.log(JSON.stringify(status, null, 2));
    });

  cmd
    .command("restart")
    .description("Restart agents")
    .option("-d, --detached", "Run in background")
    .option("--gatekeepers <count>", "Number of Gatekeeper agents", "1")
    .option("--developers <count>", "Number of Developer agents", "1")
    .action(async (options) => {
      const status = await service.restart({
        detached: Boolean(options.detached),
        gatekeepers: Number(options.gatekeepers),
        developers: Number(options.developers),
      });
      console.log(JSON.stringify(status, null, 2));
    });

  cmd
    .command("logs")
    .description("Show aggregated logs")
    .option("--all", "Show logs for all agents")
    .option("--role <role>", "Show logs for the role")
    .option("--tail <count>", "Number of lines per agent", "200")
    .action(async (options) => {
      validateTargetSelection(Boolean(options.all), options.role as AgentRole | undefined, "logs");
      const logs = await service.logs({
        all: Boolean(options.all),
        role: options.role as AgentRole | undefined,
        tail: Number(options.tail),
      });
      console.log(logs);
    });

  return cmd;
}

function validateTargetSelection(all: boolean, role: AgentRole | undefined, commandName: string): void {
  if (all && role) {
    throw new Error(`${commandName}: --all and --role cannot be used together`);
  }

  if (!all && !role) {
    throw new Error(`${commandName}: either --all or --role is required`);
  }
}

function emitAgentRuntimeLog(agent: AgentRuntime): void {
  emitJsonl({
    ts: new Date().toISOString(),
    level: agent.status === "failed" ? "error" : "info",
    event: "fleet.agent.state",
    agentId: agent.id,
    role: agent.role,
    status: agent.status,
    pid: agent.pid,
    cwd: agent.cwd,
    startedAt: agent.startedAt,
    lastHeartbeatAt: agent.lastHeartbeatAt,
    lastError: agent.lastError ?? null,
  });
}

function emitSessionLog(session: AppServerSession): void {
  emitJsonl({
    ts: new Date().toISOString(),
    level: session.status === "error" ? "error" : "info",
    event: "fleet.session.state",
    agentId: session.agentId,
    status: session.status,
    initialized: session.initialized,
    threadId: session.threadId ?? null,
    activeTurnId: session.activeTurnId ?? null,
    lastNotificationAt: session.lastNotificationAt,
    lastError: session.lastError ?? null,
  });
}

function emitJsonl(record: Record<string, unknown>): void {
  console.log(JSON.stringify(record));
}

async function waitForShutdownSignal(service: FleetService): Promise<void> {
  await new Promise<void>((resolve) => {
    const watchedSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
    let shuttingDown = false;

    const cleanup = (): void => {
      for (const signal of watchedSignals) {
        process.removeListener(signal, onSignal);
      }
    };

    const onSignal = (signal: NodeJS.Signals): void => {
      if (shuttingDown) {
        emitJsonl({
          ts: new Date().toISOString(),
          level: "warn",
          event: "fleet.down.force_exit",
          signal,
        });
        process.exit(130);
      }

      shuttingDown = true;
      void (async () => {
        emitJsonl({
          ts: new Date().toISOString(),
          level: "info",
          event: "fleet.down.requested",
          trigger: "signal",
          signal,
        });

        try {
          const status = await service.down({ all: true });
          for (const agent of status.agents) {
            emitAgentRuntimeLog(agent);
          }
          for (const session of status.sessions) {
            emitSessionLog(session);
          }
          emitJsonl({
            ts: new Date().toISOString(),
            level: "info",
            event: "fleet.down.completed",
            summary: status.summary,
            agentCount: status.agents.length,
          });
        } catch (error) {
          process.exitCode = 1;
          emitJsonl({
            ts: new Date().toISOString(),
            level: "error",
            event: "fleet.down.failed",
            message: error instanceof Error ? error.message : String(error),
          });
        } finally {
          cleanup();
          resolve();
        }
      })();
    };

    for (const signal of watchedSignals) {
      process.on(signal, onSignal);
    }
  });
}
