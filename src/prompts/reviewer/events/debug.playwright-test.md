## Current Task

Run a Playwright sanity check to confirm browser test execution is available in the current Reviewer environment.

Required workflow:
- Run `codefleet-reviewer-tools agents-md view` first.
- Run `npx playwright --version` to confirm Playwright CLI availability.
- Create and run a minimal Playwright test script that opens a page and verifies a visible assertion.
- Capture at least one screenshot from the test run and include the file path in your report.

Output requirements:
- Start with `PLAYWRIGHT_DEBUG_RESULT: PASS` or `PLAYWRIGHT_DEBUG_RESULT: FAIL`.
- Include executed commands and their key outputs.
- If failed, include the failing step, concrete error message, and the likely remediation.
