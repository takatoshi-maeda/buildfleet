import { Command } from "commander";
import {
  createCodefleetCommandDispatcher,
  EventRouter,
  SYSTEM_EVENT_COMMAND_DEFINITIONS,
  SYSTEM_EVENT_TYPES,
  type RouteResult,
  type SystemEvent,
} from "../../events/router.js";
import {
  AgentEventQueueService,
  type AgentEventQueueEnqueueResult,
} from "../../domain/events/agent-event-queue-service.js";

interface TriggerCommandOptions {
  router?: Pick<EventRouter, "route">;
  queue?: Pick<AgentEventQueueService, "enqueueToRunningAgents">;
}

export function createTriggerCommand(options: TriggerCommandOptions = {}): Command {
  const router = options.router ?? new EventRouter(createCodefleetCommandDispatcher());
  const queue = options.queue ?? new AgentEventQueueService();

  const cmd = new Command("trigger");
  cmd.description("Trigger a system event manually");
  cmd.configureHelp({
    // Commander appends `[options]` for any command with options. For event-style
    // subcommands this is noisy, so keep only command name and explicit args.
    subcommandTerm: (subcommand: Command) => `${subcommand.name()}${formatRegisteredArgs(subcommand)}`,
  });

  for (const eventType of SYSTEM_EVENT_TYPES) {
    const definition = SYSTEM_EVENT_COMMAND_DEFINITIONS[eventType];
    const subcommand = cmd.command(eventType).description(definition.description);
    if (definition.options && definition.options.length > 0) {
      const summary = definition.options
        .map((option) => option.summaryToken)
        .filter((token): token is string => typeof token === "string" && token.length > 0)
        .join(" ");
      if (summary.length > 0) {
        subcommand.summary(summary);
      }
      for (const option of definition.options) {
        const parser = option.parser === "csv-repeatable" ? collectCsvRepeatable : undefined;
        if (option.required) {
          if (parser) {
            subcommand.requiredOption(option.flags, option.description, parser, []);
          } else {
            subcommand.requiredOption(option.flags, option.description);
          }
          continue;
        }
        if (parser) {
          subcommand.option(option.flags, option.description, parser, []);
        } else {
          subcommand.option(option.flags, option.description);
        }
      }
    }
    subcommand.action(async (parsedOptions: Record<string, unknown>) => {
      await executeRoute(router, queue, definition.createEvent(parsedOptions));
    });
  }

  return cmd;
}

async function executeRoute(
  router: Pick<EventRouter, "route">,
  queue: Pick<AgentEventQueueService, "enqueueToRunningAgents">,
  event: SystemEvent,
): Promise<void> {
  const enqueueResult = await queue.enqueueToRunningAgents(event);
  const result = await router.route(event);
  printRouteResult(event, result, enqueueResult);
}

function printRouteResult(event: SystemEvent, result: RouteResult, enqueueResult: AgentEventQueueEnqueueResult): void {
  console.log(
    JSON.stringify(
      {
        event,
        queue: enqueueResult,
        deduped: result.deduped,
        executions: result.executions,
      },
      null,
      2,
    ),
  );
}

function collectCsvRepeatable(value: string, previous: string[] = []): string[] {
  const nextValues = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return [...previous, ...nextValues];
}

function formatRegisteredArgs(command: Command): string {
  if (command.registeredArguments.length === 0) {
    return "";
  }

  const args = command.registeredArguments.map((arg) => {
    const base = arg.variadic ? `${arg.name()}...` : arg.name();
    return arg.required ? `<${base}>` : `[${base}]`;
  });
  return ` ${args.join(" ")}`;
}
