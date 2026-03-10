## Current Task

Epic ID to continue after FrontendDeveloper handoff: {{epicId}}

Objectives:
- Treat existing frontend changes as the starting point and complete the remaining Epic work.
- Focus on backend, integration, validation, and any explicitly documented follow-up work.

Implementation guidance:
- Before implementation, run the following commands to review the Epic, Items, and handoff notes:
  - `codefleet-developer-tools agents-md view`
  - `codefleet-developer-tools --help`
  - `codefleet-developer-tools current-context view --epic {{epicId}}`
- Read Epic and Item notes first and treat FrontendDeveloper handoff notes as the authoritative context for completed frontend work.
- Do not re-implement frontend work unless the handoff notes or failing tests show a concrete defect.
- Finish the remaining Epic work, run validation, and prepare the Epic for polishing.
