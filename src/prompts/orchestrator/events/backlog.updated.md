## Current Task

This event indicates that backlog refinement is required after upstream specification updates.

Objectives:
- First, run `codefleet-backlog --help-for-agent` to load agent-specific usage guidance.
- Also run `bin/codefleet-acceptance-test --help-for-agent` to load agent-specific guidance for reading and maintaining acceptance criteria.
- Before any backlog decision, run `codefleet-acceptance-test list` and explicitly review the current acceptance criteria.
- Retrieve the current acceptance criteria by using `bin/codefleet-acceptance-test`, and treat those criteria as the primary source for backlog creation and refinement.
- If acceptance criteria cannot be listed or confirmed, stop backlog refinement and report that blocker explicitly instead of proceeding with assumptions.
- Refine backlog Epics and Items by executing `codefleet-backlog` commands that actually register/update backlog data, not by proposing a plan only in text.
- Treat backlog planning as executable development planning, not documentation-only maintenance.
- Even when information is incomplete, make autonomous cross-functional decisions (product, technical design, and UX) and convert them into actionable backlog structure.
- Ensure the backlog enables smooth implementation flow, including practical sequencing, dependency control, and clear readiness for developers.

Output requirements:
- Start with a concise planning-intent summary of what delivery outcome the refined backlog is meant to unlock.
- Provide a backlog refinement result grounded in acceptance criteria from `bin/codefleet-acceptance-test`, `codefleet-backlog` command outputs, and your cross-functional judgment.
- Include a short "Acceptance source check" section that states `codefleet-acceptance-test list` was run and summarizes the criteria used for planning.
- Register/update concrete Epics and Items through commands, then verify final state with both `codefleet-backlog epic list` and `codefleet-backlog item list`.
- Explicitly state assumptions and trade-off decisions made due to missing information.
- Include a clear Definition of Done: completion means backlog data is updated in storage and can be confirmed via `codefleet-backlog epic list` and `codefleet-backlog item list`; text-only plan responses are not sufficient.
