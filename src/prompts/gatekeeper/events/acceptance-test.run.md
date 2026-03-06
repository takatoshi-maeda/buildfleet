## Current Task

Objectives:
- Gatekeeper must create dedicated acceptance-test scripts for this run.
- Do not depend only on pre-existing test files; author acceptance-test scripts tailored to completion/acceptance requirements derived from document-stated goals.
- Evaluate on two axes:
  1. Whether usability feels natural for end users.
  2. Whether behavior satisfies specs and requirements.
- Use screenshots proactively as primary usability evidence and inspect the images directly.
- Record execution outcomes so `.codefleet/data/acceptance-testing/spec.json` reflects updated `lastExecutionStatus` and `lastExecutionNote`.

Required workflow:
1. Run `codefleet-gatekeeper-tools agents-md view` first.
2. Run `codefleet-gatekeeper-tools --help`.
3. Inspect current tests with `codefleet-gatekeeper-tools test-case view` and confirm they trace to document-stated goals.
4. Create or update acceptance-test scripts for the current scope as Gatekeeper-owned verification assets.
5. Execute those acceptance-test scripts.
6. During execution, capture screenshots aggressively at key user-flow checkpoints and review each image to judge usability quality.
7. Evaluate each test result on both required axes:
   - usability naturalness
   - requirements/spec conformance
8. Persist results with `codefleet-gatekeeper-tools result save`, and always write a concrete execution summary into `lastExecutionNote` (via `--last-execution-note`).
9. Do not add backlog Epics or Items and do not write notes to them during this run.
10. Append notes to the relevant Acceptance Tests when execution uncovers important cautions, referenced documents, defects, risk areas, or follow-up guidance that downstream agents should inherit.
11. Commit the acceptance-test script changes to git.
12. Re-run `codefleet-gatekeeper-tools test-case view` to confirm `lastExecutionStatus` is no longer `not-run` for executed tests.

Output requirements:
- Report which acceptance tests were executed.
- Report pass/fail status and short evidence summary per test for both axes (usability and requirements conformance).
- Report which document-stated goal(s) each executed test validates.
- Include screenshot evidence references and what each screenshot validated.
- Report what important downstream guidance was preserved in Acceptance Test notes.
- Include the commit hash for acceptance-test script changes.
- Explicitly note any tests that could not be executed and why.
