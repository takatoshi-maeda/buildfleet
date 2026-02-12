import { Command } from "commander";
import {
  createCodefleetCommandDispatcher,
  EventRouter,
  type RouteResult,
  type SystemEvent,
} from "../../events/router.js";

interface TriggerCommandOptions {
  router?: Pick<EventRouter, "route">;
}

export function createTriggerCommand(options: TriggerCommandOptions = {}): Command {
  const router = options.router ?? new EventRouter(createCodefleetCommandDispatcher());

  const cmd = new Command("trigger");
  cmd.description("Trigger a system event manually");

  cmd
    .command("manual.triggered")
    .description("SystemEvent.type=manual.triggered")
    .requiredOption("--actor <actor>", "Orchestrator | Gatekeeper | Developer")
    .action(async (options: { actor: string }) => {
      if (!isManualActor(options.actor)) {
        throw new Error(`manual.triggered: invalid actor '${options.actor}'`);
      }
      await executeRoute(router, { type: "manual.triggered", actor: options.actor });
    });

  cmd
    .command("git.main.updated")
    .description("SystemEvent.type=git.main.updated")
    .requiredOption("--commit <commit>", "Updated commit hash")
    .action(async (options: { commit: string }) => {
      await executeRoute(router, { type: "git.main.updated", commit: options.commit });
    });

  cmd
    .command("acceptance.result.created")
    .description("SystemEvent.type=acceptance.result.created")
    .requiredOption("--path <path>", "Path to acceptance result file")
    .action(async (options: { path: string }) => {
      await executeRoute(router, { type: "acceptance.result.created", path: options.path });
    });

  cmd
    .command("backlog.poll.tick")
    .description("SystemEvent.type=backlog.poll.tick")
    .requiredOption("--actor <actor>", "Developer | Gatekeeper")
    .requiredOption("--at <at>", "Tick timestamp (ISO 8601)")
    .action(async (options: { actor: string; at: string }) => {
      if (!isBacklogActor(options.actor)) {
        throw new Error(`backlog.poll.tick: invalid actor '${options.actor}'`);
      }
      await executeRoute(router, { type: "backlog.poll.tick", actor: options.actor, at: options.at });
    });

  cmd
    .command("fleet.lifecycle.changed")
    .description("SystemEvent.type=fleet.lifecycle.changed")
    .requiredOption("--status <status>", "starting | running | stopped | degraded")
    .action(async (options: { status: string }) => {
      if (!isLifecycleStatus(options.status)) {
        throw new Error(`fleet.lifecycle.changed: invalid status '${options.status}'`);
      }
      await executeRoute(router, { type: "fleet.lifecycle.changed", status: options.status });
    });

  cmd
    .command("docs.update")
    .description("SystemEvent.type=docs.update")
    .requiredOption("--paths <path>", "Updated document path (repeatable/comma-separated)", collectPaths, [])
    .action(async (options: { paths: string[] }) => {
      const paths = options.paths.filter((value) => value.length > 0);
      if (paths.length === 0) {
        throw new Error("docs.update: --paths must include at least one path");
      }
      await executeRoute(router, { type: "docs.update", paths });
    });

  return cmd;
}

async function executeRoute(router: Pick<EventRouter, "route">, event: SystemEvent): Promise<void> {
  const result = await router.route(event);
  printRouteResult(event, result);
}

function printRouteResult(event: SystemEvent, result: RouteResult): void {
  console.log(
    JSON.stringify(
      {
        event,
        deduped: result.deduped,
        executions: result.executions,
      },
      null,
      2,
    ),
  );
}

function isManualActor(value: string): value is "Orchestrator" | "Gatekeeper" | "Developer" {
  return value === "Orchestrator" || value === "Gatekeeper" || value === "Developer";
}

function isBacklogActor(value: string): value is "Developer" | "Gatekeeper" {
  return value === "Developer" || value === "Gatekeeper";
}

function isLifecycleStatus(value: string): value is "starting" | "running" | "stopped" | "degraded" {
  return value === "starting" || value === "running" || value === "stopped" || value === "degraded";
}

function collectPaths(value: string, previous: string[] = []): string[] {
  const nextValues = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return [...previous, ...nextValues];
}
