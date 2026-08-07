---
name: connector-space-isolation-rca-2026-08-07
title: "Connector per-connection space isolation RCA"
description: "Root-cause analysis and local fix for connector memory spaces co-mingling multiple Nango connections."
date: 2026-08-07
model: "Codex director; native openai-codex/gpt-5.6-luna smoke"
sources:
  - "apps/memroos/src/lib/connectors/manifest.ts"
  - "apps/memroos/src/lib/store/connectors.ts"
  - "apps/memroos/src/lib/connectors/sync-job.ts"
  - "apps/memroos/src/lib/store/__tests__/connectors.test.ts"
  - "apps/memroos/src/lib/tool-auth/nango-client.ts"
derived_from:
  - "content/research/nango-connection-ownership-rca-2026-08-07.md"
regen_prompt: "Re-audit connector memory-space isolation, Nango connection ownership, scheduler scoping, and live Linear/Circleback/Notion proof; distinguish code evidence from production evidence."
---

# Connector per-connection space isolation RCA

## Finding

Connector ingestion previously called `ensureConnectorSpace` with only `tenantId` and `providerKey`. Its space name was `connector/<provider>`, so multiple Nango accounts for the same provider shared one memory space. Space membership and labels were tenant-scoped, which made the boundary unable to distinguish separate connected accounts.

## Local fix

- `connectorSpaceName(providerKey, connectionId?)` now emits `connector/<provider>/<sha256-prefix>` when a connection id is supplied.
- The external Nango connection id is hashed, not copied into a human-visible path.
- Legacy provider-only callers remain stable.
- `runConnectorCycle` passes the Nango connection id into `ensureConnectorSpace`.
- Regression coverage proves same connection stability, distinct connection isolation, and no raw connection id in space names.

Commit: `8e9af0b8` on `codex/gsd-roadmap-completion`.

## Verification

- Connector store: 27/27 tests passed.
- Full fast suite: 472 files passed, 3,975 tests passed, 52 skipped.
- Typecheck passed.
- Targeted ESLint passed.
- GitNexus staged detect-changes: 4 files, 4 symbols, 0 affected processes, low risk.
- Slow auth split: 2/2 tests passed.
- Slow onboarding split: 46/46 tests passed.
- The aggregate slow command was terminated with exit 143 by the execution environment before its audit-performance file completed; no failure was emitted. Prior baseline evidence had the full slow suite green.

## Remaining live proof

This is a code-level isolation fix, not proof that production Nango accounts are connected or that Cordant/Oracle have been deployed. Live verification still requires:

1. production deployment after explicit operator authorization;
2. two-account/provider fixtures or sanitized live metadata proving separate spaces;
3. live recall as Eric and registered Cordant agents;
4. scheduler health/last-run and quarantine telemetry;
5. connmem and provider sync evidence for Linear, Circleback, and Notion.

The native Luna-Max Beastmode audit was attempted with requested `openai-codex/gpt-5.6-luna` at max thinking. The direct read smoke proved the installed launcher can read the repository; the multi-file audit timed out without worker metadata, so no Luna audit claim is made.


## Scheduler health follow-up (2026-08-07)

The local fix now also exposes connector scheduler health without changing the shared cron-health core:

- connector-sync is seeded lazily when a cycle actually runs, preserving existing pause/stop state.
- Successful cycles record a heartbeat, processed count, duplicate/skip counts, and provider metadata.
- Missing access tokens are reported as <provider>/auth; outer discovery failures are reported as scheduler, so the health row becomes actionable rather than silently green.
- Observability remains fail-open for legacy/partial databases and cannot turn a provider sync failure into a harder failure.
- Added focused regression coverage for healthy empty cycles and scheduler discovery failure.

Commit: 2f702d8c on codex/gsd-roadmap-completion.

Verification after this follow-up:

- Full fast suite: 473 files passed, 2 skipped; 3,977 tests passed, 52 skipped.
- Focused sync-job health tests: 2/2 passed.
- Typecheck and targeted ESLint passed.
- GitNexus staged detect-changes: 2 files, 3 symbols, 0 affected processes, low risk.

Production deployment, live Nango fixtures, and live connector recall remain unverified until an authorized push/deploy window.


## Main-base integration follow-up (2026-08-07)

The validated connector commits were carried onto a clean branch from origin/main (1cc84c3f), rather than merging the stale feature tip wholesale. This avoids regressing main's newer SQLite type-boundary and GSD closeout work.

- Integration branch: codex/connector-isolation-main
- Integration commits: 13f8aaba (space isolation), 2aced7af (scheduler health)
- Branch delta: 2 commits ahead of main; working tree clean.
- GitNexus compare against main: 5 files, 7 symbols, 0 affected processes, LOW risk.
- Current-base full fast gate: 473 files passed, 3,977 tests passed, 52 skipped.
- Current-base typecheck, targeted ESLint, and connector/cron-health tests (62/62) passed.

The branch has not been pushed, merged into main, or deployed to Cordant/Oracle because outbound authorization is still pending.
