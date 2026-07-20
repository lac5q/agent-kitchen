# Phase 170 — OBSERVE-10..12 hardening (Wave-2/3 adapters)

**Completed:** 2026-07-18
**Branch:** `gsd/v8.16-phase-170-observe-wave2-3` (merged to main as part of `dc775216`)
**Commits:** `2ae8f5bc` feat(observe): harden v8.16 Phase 170 Wave-2/3 adapters

## Scope

Closed v8.16 OBSERVE-10 (Cursor), OBSERVE-11 (Factory/Droid), OBSERVE-12 (Antigravity).

## Implementation summary

- **Cursor (OBSERVE-10)**: catalog entry `maturity: "mcp-partial"`, `sessionRoots: [".cursor/projects"]`. Real JSONL exists at `~/.cursor/projects/*/agent-transcripts/<session-uuid>/<session-uuid>.jsonl` plus `subagents/*.jsonl`, but vendor schema is wrapped in `<timestamp>` / `<user_query>` text tags — non-standard, kept as partial.
- **Factory/Droid (OBSERVE-11)**: catalog entry promoted to `maturity: "hooks+jsonl"`, `sessionRoots: [".factory", ".factory/sessions"]`. JSONL at `~/.factory/sessions/-<cwd-dir>/<session-uuid>.jsonl` with `session_start` + `message` events; MCP config at `~/.factory/mcp.json`. `CodingAgentRuntime.droid` already wired.
- **Antigravity (OBSERVE-12)**: catalog entry `maturity: "limited"`, empty `sessionRoots`. No verified JSONL/CLI surface in `~/.antigravity`, `~/.config/antigravity`, `~/bin/antigravity`. Notes string explicitly documents "no capture path; observe via MCP only; verify-by-design" so no false full-capture claim is made.
- Installer TARGETS (`scripts/install-agent-integrations.sh`): added `antigravity` with explicit no-op install step that emits "no installer surface; observe via MCP only" signal.
- Docs (`docs/runtime-adapter-maturity.md`, `docs/integrations/observe-onboard.md`) updated to match catalog.

## Tests added

`apps/memroos/src/lib/__tests__/observe-sidecar.test.ts` — 4 new test cases:
- `Cursor (OBSERVE-10) keeps mcp-partial maturity and documents non-vendor-free JSONL`
- `Factory/Droid (OBSERVE-11) maps droid, lists JSONL roots, and notes carry 'droid'`
- `Antigravity (OBSERVE-12) row exists in catalog with honest 'no capture path' note`
- `Wave 2 factory roots resolve and surface real JSONL on a populated home (smoke path)`

## Verification

- Lint: 0 errors (76 pre-existing warnings).
- Typecheck: clean.
- `test:fast`: 3206 passed, 1 failed (pre-existing `pulse-strip.test.tsx` UI copy assertion, unrelated to this PR).
- Targeted: `observe-sidecar.test.ts` (8/8), `observe-health.test.ts` (2/2), `observe-capture-depth.test.ts` (6/6) all green.

## Constraints honored

- No new runtime npm dependencies.
- Wave-1 behavior byte-identical: `resolveObserveRoots(home, 1)` returns the same 5 harnesses.
- `CodingAgentRuntime` union already accepts free-form `| string`, so no enum churn.

## Follow-ups

- Antigravity remains a verify-by-design stub until vendor publishes exporter or MCP server.
- Pre-existing `pulse-strip.test.tsx` failure tracked separately.
