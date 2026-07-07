# AGENTS.md

## Purpose

- `codefleet` is a multi-agent software delivery orchestrator.
- It turns source documents and change requests into structured work artifacts such as backlog epics/items and acceptance-test specifications.
- It coordinates specialized agent roles around those shared artifacts through CLI commands, MCP tools, and event-driven workflows.
- The system keeps implementation work, review/polish steps, and acceptance validation aligned through explicit shared state under `.codefleet/`.

## Repository Layout

- `src/domain/` — core models and services (backlog, acceptance, documents, fleet, events, relations, source-brief). Fleet role behavior is centralized in `src/domain/fleet/agent-role-definitions.ts`.
- `src/events/` — `SystemEvent` union and event router (`src/events/router.ts`), plus watchers (e.g. `backlog-poller.ts`). Event types, trigger commands, and role subscriptions are kept in sync here.
- `src/application/` — application-layer tool implementations shared by MCP and agent tooling.
- `src/api/mcp/` — Hono-based MCP server (`server.ts`, default `127.0.0.1:3290`) exposing backlog/fleet-observability tools and the front-desk / release-plan agents. Tool executions are audit-logged to `.codefleet/runtime/mcp/tool-executions.jsonl`.
- `src/agents/` — front-desk and release-plan agents and their tools.
- `src/infra/` — adapters: agent runtimes (`claude-agent-sdk-runtime.ts`, `codex-app-server-runtime.ts`), app-server client, fs, process.
- `src/cli/` — commander-based CLI entry points and subcommands (`src/cli/commands/`).
- `src/prompts/` — per-role prompt instructions and event prompt templates.
- `src/schemas/` — JSON Schemas for persisted state (backlog items, acceptance tests, roles, agent runtime/session). Validated with ajv.
- `src/generated/` — generated code (e.g. app-server types). Regenerate; do not hand-edit.
- `tests/` — vitest test suite (flat, one file per feature area).
- `ui/` — separate Expo (expo-router) web UI package (`@takatoshi-maeda/codefleet-ui`); talks to the MCP server. Has its own `package.json` and vendored `ai-kit-expo`.
- `vendor/ai-kit` — vendored `ai-kit` package (LLM clients/agents, `ai-kit/hono` MCP mounting), consumed via `file:` dependency.
- `bin/` — Node wrapper scripts. In the repo they run TypeScript sources directly via `tsx` (no build needed for local CLI use); packaged installs fall back to `dist/`.
- `scripts/smoke-test/` — manual smoke tests (e.g. `mcp-smoke.ts`).

## Agent Roles and Event Flow

Roles react to `SystemEvent`s and emit follow-up events, forming a pipeline. Role/event wiring lives in `agent-role-definitions.ts`; keep it, `src/events/router.ts`, and role prompts consistent when changing any of them.

| Role | Wakes on | Emits |
| --- | --- | --- |
| Curator | `release-plan.create` | `source-brief.update` |
| Gatekeeper | `source-brief.update`, `acceptance-test.required` | `acceptance-test.update` / — |
| Orchestrator | `acceptance-test.update` | `backlog.update` |
| Developer | `backlog.epic.ready`, `backlog.epic.frontend.completed` | `backlog.epic.polish.ready` |
| FrontendDeveloper | `backlog.epic.frontend.ready` | `backlog.epic.frontend.completed` |
| Polisher | `backlog.epic.polish.ready` | `backlog.epic.review.ready` |
| Reviewer | `backlog.epic.review.ready`, `debug.playwright-test` | — |

Events can be fired manually with `codefleet trigger <event-type>`.

## Local State (`.codefleet/`)

- `config.json` — project config created by `codefleet init`.
- `data/`, `runtime/`, `logs/`, `archives/` — gitignored runtime state. Manage via `codefleet state archive` / `codefleet state reset`; do not edit by hand.

## CLI Entry Points

- `codefleet` — fleet control (`up`, `down`, `restart`, `status`, `logs`) plus `init`, `state`, `trigger`, `supervisor` (multi-fleet management from a shared config).
- `codefleet-backlog`, `codefleet-acceptance-test` — manage backlog and acceptance-test artifacts.
- `codefleet-<role>-tools` (orchestrator/curator/developer/gatekeeper/polisher/reviewer) — role-scoped tool CLIs given to each agent.
- `ui/bin/codefleet-web` — start the web UI.

## Basic Rules for Changes

- Preserve type safety under the existing TypeScript settings (`strict: true`).
- Do not break Node ESM behavior: `NodeNext` resolution, and relative imports must use `.js` extensions (even from `.ts` files).
- Proactively add code comments to explain design intent that cannot be inferred directly from the code (e.g., trade-offs, invariants, and domain-specific constraints).
- When adding or changing a `SystemEvent`, update the router's command definitions, role subscriptions, and prompt templates together — the types are designed to force this.
- Persisted-state shape changes must be reflected in the corresponding JSON Schema under `src/schemas/`.
- Never edit `src/generated/` by hand; regenerate instead.

## Coding Conventions

- Domain-layer failures are expressed as `CodefleetError` with an `ErrorCode` (`src/shared/errors.ts`), not bare `Error`. Add a new code when introducing a new failure mode.
- Services receive their dependencies (paths, clocks, publishers) via constructor arguments — no global/singleton lookups.
- Inject `Clock` (`src/shared/clock.ts`) instead of calling `new Date()` directly, so tests can pin time.
- Generate IDs with `createUlid` (`src/shared/ulid.ts`).
- Persist state through `JsonRepository` / `atomicWriteJson` in `src/infra/fs/` (schema-validated, crash-safe) rather than raw `fs.writeFile`.
- Domain services may use infra helpers directly, but where swappability or test isolation matters, the codebase defines a port interface in the domain and injects the implementation (e.g. `fleet-api-server-lifecycle-port.ts`, `HookCommandRunner`). Follow that pattern when adding similar seams.

## Frequently Used Commands

- Install dependencies: `npm install` (and `npm install` in `ui/` when touching the UI)
- Build: `npm run build`
- Test: `npm test` (vitest; watch mode: `npm run test:watch`)
- Run a single test file (preferred while iterating): `npx vitest run tests/<name>.test.ts`
- Generate app-server types: `npm run generate:app-server:types`
- Run CLI from source: `./bin/codefleet ...` (uses `tsx`, no build required)

## Debugging

- `CODEFLEET_DEBUG_REASONING=1` — log agent reasoning output from fleet runtimes.
- `CODEFLEET_DEBUG_APP_SERVER_EVENTS=1` — log raw app-server events (both flags accept `1` or `true`; see `src/cli/commands/fleetctl.ts`).
- MCP tool executions are recorded in `.codefleet/runtime/mcp/tool-executions.jsonl`; fleet logs are under `.codefleet/logs/` (`codefleet logs`).

## Testing Policy

- For spec changes or bug fixes, add regression tests under `tests/` whenever possible; follow the existing flat `<feature>.test.ts` naming.
- Prefer real behavior over mocks: existing tests create a temp workspace with `fs.mkdtemp` and exercise services against the real filesystem (see `tests/backlog-service.test.ts`). Reserve `vi.mock` for external processes/SDKs that cannot run in tests.
- At minimum, run `npm test`; additionally run `npm run build` when type/build integrity needs verification.
- The `ui/` package has no automated tests; verify UI changes manually via `codefleet-web`.
