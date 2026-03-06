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
- Run `codefleet-orchestrator-tools agents-md view` first to load repository-specific operating guidance from the docsRepository clone.
- Read `.codefleet/data/source-brief/latest.md` first and treat it as the primary normalized source input before deeper repo exploration.
- Explore the repository and collect evidence from both documentation and codebase before finalizing backlog updates.
- Start by running `codefleet-orchestrator-tools --help` to understand the intended command usage, then choose and execute the necessary commands for exploration, backlog updates, and verification.
- Persist handoff context in notes on the relevant Acceptance Tests, Epics, and Items whenever you encounter important operating cautions, referenced documents, assumptions, trade-offs, or follow-up guidance for downstream agents.
- If important information is missing, continue with best-effort assumptions and speculative Epic/Item creation, and always record unresolved points as questions.
- Report format is free. Include enough command evidence and rationale to make actions and outcomes verifiable.
- Never finish with only a planning narrative. Command execution evidence is mandatory.

Definition of Done (strict):
- Done only if all conditions are true:
  - Repository exploration was performed and documented using both docs and codebase evidence.
  - `codefleet-orchestrator-tools current-context view` was executed.
  - Required backlog questions were added for unresolved ambiguities.
  - Epics were persisted via `codefleet-orchestrator-tools epic upsert`.
  - Items were persisted via `codefleet-orchestrator-tools item upsert`.
  - Important downstream guidance was preserved in Acceptance Test, Epic, and/or Item notes when relevant context was discovered.
  - Persisted results were verified via `codefleet-orchestrator-tools current-context view`.
- If any condition is missing, report `NOT DONE` with the missing command/action.
