## Current Task

Epic ID to implement now: {{epicId}}

Objectives:
- Build an implementation that fully satisfies the Epic and its related Items.

Implementation guidance:
- If anything is unclear, proceed with the best judgment based on explicit assumptions.
- Record assumptions and decisions by appending notes to the relevant Item.
- Before implementation, run the following commands to review requirements, Epic, and Items:
  - `codefleet-backlog requirements read`
  - `codefleet-backlog epic read --id {{epicId}}`
  - `codefleet-backlog item list --epic-id {{epicId}}`
- When setting up a development environment, create a local environment that is as close to production as possible. Use Docker as the default approach.
- Use Item-sized commits as the baseline commit granularity.
