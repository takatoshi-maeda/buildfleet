## Current Task

Objectives:
- Run acceptance tests immediately via `codefleet-acceptance-test` commands.
- Record execution outcomes so `.codefleet/data/acceptance-testing/spec.json` reflects updated `lastExecutionStatus`.
- Keep execution evidence concise and actionable for downstream review.

Required workflow:
1. Run `codefleet-acceptance-test --help-for-agent` first.
2. Inspect current tests with `codefleet-acceptance-test list`.
3. Execute each pending acceptance test and persist results with `codefleet-acceptance-test result add`.
4. Re-run `codefleet-acceptance-test list` to confirm `lastExecutionStatus` is no longer `not-run` for executed tests.

Output requirements:
- Report which acceptance tests were executed.
- Report pass/fail status and short evidence summary per test.
- Explicitly note any tests that could not be executed and why.
