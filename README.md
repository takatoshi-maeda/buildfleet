# CodeFleet

CodeFleet is a multi-agent software delivery orchestrator. It turns source documents and change requests into structured work artifacts — backlog epics/items and acceptance-test specifications — and coordinates a fleet of specialized agent roles around those shared artifacts through CLI commands, MCP tools, and event-driven workflows.

## How It Works

Agent roles react to `SystemEvent`s and emit follow-up events, forming a delivery pipeline:

| Role | Wakes on | Emits |
| --- | --- | --- |
| Curator | `release-plan.create` | `source-brief.update` |
| Gatekeeper | `source-brief.update`, `acceptance-test.required` | `acceptance-test.update` |
| Orchestrator | `acceptance-test.update` | `backlog.update` |
| Developer | `backlog.epic.ready`, `backlog.epic.frontend.completed` | `backlog.epic.polish.ready` |
| FrontendDeveloper | `backlog.epic.frontend.ready` | `backlog.epic.frontend.completed` |
| Polisher | `backlog.epic.polish.ready` | `backlog.epic.review.ready` |
| Reviewer | `backlog.epic.review.ready`, `debug.playwright-test` | — |

All shared state (backlog, acceptance tests, runtime logs) lives under `.codefleet/` in the target project, so implementation, review/polish, and acceptance validation stay aligned. Events can also be fired manually with `codefleet trigger <event-type>`.

Key pieces:

- **CLI** (`codefleet` and friends) — fleet control (`up`, `down`, `restart`, `status`, `logs`), project `init`, state management, and role-scoped tool CLIs given to each agent.
- **MCP server** (Hono-based, default `127.0.0.1:3290`) — exposes backlog/fleet-observability tools plus the front-desk and release-plan agents.
- **Web UI** (`ui/`, Expo web) — talks to the MCP server; started via `codefleet-web`.
- **Agent runtimes** — fleet agents run on the Claude Agent SDK or the Codex app-server runtime.

See [AGENTS.md](AGENTS.md) for the full architecture, repository layout, and coding conventions.

## Development Setup

### Prerequisites

- Node.js 22 or later (npm included)
- API credentials for the agent runtimes you use:
  - `ANTHROPIC_API_KEY` for the Claude Agent SDK runtime (or an authenticated Claude Code install)
  - The `codex` CLI for the Codex app-server runtime (also required for `npm run generate:app-server:types`)
  - `OPENAI_API_KEY` for the front-desk agent (default provider; configurable per provider)

### Install

```bash
git clone https://github.com/takatoshi-maeda/codefleet.git
cd codefleet
npm install
```

`vendor/ai-kit` is a vendored `file:` dependency and is installed automatically by `npm install`.

No build step is needed for local development — the `bin/` wrappers run the TypeScript sources directly via `tsx`:

```bash
./bin/codefleet --help
```

### Verify

```bash
npm test           # vitest suite (watch mode: npm run test:watch)
npm run build      # type-check / compile to dist/
```

While iterating, prefer running a single test file:

```bash
npx vitest run tests/<name>.test.ts
```

### Try It on a Project

```bash
cd /path/to/your-project
/path/to/codefleet/bin/codefleet init     # creates .codefleet/config.json
/path/to/codefleet/bin/codefleet up       # start the fleet + MCP server
/path/to/codefleet/bin/codefleet status
/path/to/codefleet/bin/codefleet logs
/path/to/codefleet/bin/codefleet down
```

Runtime state under `.codefleet/` (`data/`, `runtime/`, `logs/`, `archives/`) is gitignored; manage it with `codefleet state archive` / `codefleet state reset` instead of editing by hand.

### Web UI

The UI is a separate Expo package with its own dependencies:

```bash
cd ui
npm install
./bin/codefleet-web --codefleet-api-base-url http://127.0.0.1:3290
```

It builds the Expo web bundle and serves it on `127.0.0.1:8080` by default. The UI package has no automated tests; verify changes manually in the browser.

### Debugging

- `CODEFLEET_DEBUG_REASONING=1` — log agent reasoning output from fleet runtimes.
- `CODEFLEET_DEBUG_APP_SERVER_EVENTS=1` — log raw app-server events.
- MCP tool executions are audit-logged to `.codefleet/runtime/mcp/tool-executions.jsonl`; fleet logs live under `.codefleet/logs/` (`codefleet logs`).

## License

[MIT](LICENSE)
