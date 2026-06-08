---
phase: 112-architecture-cleanup
plan: "02"
status: complete
completed: 2026-06-08
requirements: [ARCH-01, ARCH-02]
---

# Plan 112-02 Summary: Memory/SEAL Cycles + Shell Probe Hardening

## What Changed

- Added `apps/memroos/src/lib/memory/registry-contract.ts` as a leaf type module for `MemoryTierHealth`.
- Updated `adapter.ts` and `backends.ts` so the memory adapter contract no longer imports through `backends.ts`.
- Preserved the existing `MemoryTierHealth` import surface by re-exporting the type from `backends.ts`.
- Added `apps/memroos/src/lib/seal/proposal-types.ts` as a leaf union for `ProposalType`.
- Updated SEAL types/registry imports so `types.ts` no longer imports from `proposal-registry.ts`.
- Changed `SealAuditEvent` from exported to module-private because it is only needed by `SealAuditEntry`.
- Replaced `defaultHasTool()` shell-mode `command -v` with a positional-argument `sh -c` probe so the tool name is not shell-interpolated.

## GitNexus Impact

- `registerAdapter`: LOW risk; direct caller `_registerDefaultAdapters`.
- `getAdapters`: CRITICAL risk because memory search, graph query, memory health, and app health depend on it. Behavior was not changed; only type/import structure was adjusted.
- `MemoryTierHealth` in `memory/backends.ts`: MEDIUM risk; direct type importers include memory routes and inventory/eval helpers.
- `ProposalDraft`: MEDIUM risk; direct type importers include SEAL service/audit/apply/reflection and proposal routes.
- `defaultHasTool`: LOW risk.

## Verification

- `npx madge --circular --extensions ts,tsx apps/memroos/src/lib/memory/` — PASS, no circular dependency found.
- `npx madge --circular --extensions ts,tsx apps/memroos/src/lib/seal/` — PASS, no circular dependency found.
- `npm run typecheck` — PASS.
- `npm --prefix apps/memroos test -- src/lib/seal src/app/api/memory/health` — PASS, 40/40.

## Caveats

- This plan intentionally did not alter runtime behavior of `registerAdapter()` or `getAdapters()` despite the high blast radius surfaced by GitNexus.
