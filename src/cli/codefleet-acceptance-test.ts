#!/usr/bin/env node
import { createAcceptanceTestCommand } from "./commands/acceptance-test.js";

export function createAcceptanceTestCli() {
  return createAcceptanceTestCommand({
    commandName: "codefleet-acceptance-test",
    executableName: "codefleet-acceptance-test",
  }).version("0.1.0");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createAcceptanceTestCli().parseAsync(process.argv);
}
