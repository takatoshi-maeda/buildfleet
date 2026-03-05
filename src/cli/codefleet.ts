#!/usr/bin/env node
import { createFleetctlCommand } from "./commands/fleetctl.js";
import { createInitCommand } from "./commands/init.js";
import { createTriggerCommand } from "./commands/trigger.js";
import { createSupervisorCommand } from "./commands/supervisor.js";

export function createCodefleetCli() {
  const program = createFleetctlCommand({ commandName: "codefleet" });

  program
    .description("CLI for multi-agent workflow orchestration")
    .version("0.1.0");

  program.addCommand(createInitCommand());
  program.addCommand(createTriggerCommand());
  program.addCommand(createSupervisorCommand());

  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createCodefleetCli().parseAsync(process.argv);
}
