## Current Task

This event indicates that backlog refinement is required after upstream specification updates.

Objectives:
- Persist a high-quality backlog refinement aligned with the latest upstream specification updates.
- Represent planning as saved backlog data (Epics, Items, and Questions), not as a text-only proposal.
- Ensure ambiguity is explicitly captured, assumptions are transparent, and outcomes are verifiable.
- Keep backlog structure implementation-ready:
  - Epics should generally map to one feature-sized Pull Request.
  - Backlog Items should generally map to readable, reviewable commit-sized increments.
- Include technical foundation work when needed (for example CI/test baseline, environment setup, quality gates) by creating Technical Epics/Items.

Tool Usage Guidelines:
- Do not directly edit internal codefleet files. Use CLI commands only.
- Follow this fixed command sequence and do not skip steps:
  1) `codefleet-backlog --help-for-agent`
  2) `codefleet-acceptance-test --help-for-agent`
  3) `codefleet-acceptance-test list`
  4) If ambiguity exists, register it with `codefleet-backlog question add`
  5) Create/update Epics with `codefleet-backlog epic add/update`
  6) Create/update Items with `codefleet-backlog item add/update`
  7) Verify saved state with `codefleet-backlog epic list`
  8) Verify saved state with `codefleet-backlog item list`
- If important information is missing, continue with best-effort assumptions and speculative Epic/Item creation, and always record unresolved points as questions.
- Report with command-evidence first:
  - `Executed commands:` list all executed commands in order.
  - `Acceptance source check:` summarize what was confirmed from `codefleet-acceptance-test list`.
  - `Questions raised:` list each `codefleet-backlog question add` result (or `none`).
  - `Backlog changes:` summarize created/updated Epic IDs and Item IDs.
  - `Verification:` summarize what `codefleet-backlog epic list` and `codefleet-backlog item list` confirmed.
  - `Assumptions used:` list assumptions used for speculative planning.
- Never finish with only a planning narrative. Command execution evidence is mandatory.

Definition of Done (strict):
- Done only if all conditions are true:
  - `codefleet-acceptance-test list` was executed.
  - Required backlog questions were added for unresolved ambiguities.
  - Epics were persisted via `codefleet-backlog epic add/update`.
  - Items were persisted via `codefleet-backlog item add/update`.
  - Persisted results were verified by both `codefleet-backlog epic list` and `codefleet-backlog item list`.
- If any condition is missing, report `NOT DONE` with the missing command/action.
