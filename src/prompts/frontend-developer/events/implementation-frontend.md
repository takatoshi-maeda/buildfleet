## Current Task

Epic ID to implement frontend scope for now: {{epicId}}

Objectives:
- Implement only the frontend-related portion of this Epic.
- Leave the Epic in a state where Developer can complete backend, integration, and remaining work without redoing frontend decisions.

Implementation guidance:
- Before implementation, run the following commands to review the Epic and Items:
  - `codefleet-developer-tools agents-md view`
  - `codefleet-developer-tools --help`
  - `codefleet-developer-tools current-context view --epic {{epicId}}`
- Treat `developmentScopes` containing `frontend` as the boundary for this role. Do not claim full Epic completion.
- Append concise handoff notes to the relevant Epic or Items describing:
  - what frontend work was completed
  - any backend or integration work still required
  - assumptions, contracts, and risks Developer must preserve
- Validate the changed frontend behavior before handoff.
