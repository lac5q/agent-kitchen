---
phase: 159
plan: 01
type: summary
title: Hermes dual-mode memory (opt-in observe)
requirements:
  - ENTOPS-07
status: complete
---

# 159-01 SUMMARY — Hermes dual-mode memory

**Created:** 2026-07-16  
**Updated:** 2026-07-16  
**Version:** 2026-07-16.1  
**Goal:** `.planning/goals/2026-07-16-hermes-dual-mode-memory.md`

## Shipped

- Opt-in Hermes memory provider `memroos` (additive; MEMORY.md always primary)
- Observe-mode mirror to `POST /api/native-memory/ingest` (fail-open)
- Local receipts under `$HERMES_HOME/memroos-memory/observe-receipts.jsonl`
- Installer symlink script + dual-mode docs (incl. Voyage = cloud API clarification)
- `NATIVE_MEMORY_SINK_POLICY.harnessWiring = hermes_observe_opt_in`

## Explicitly not shipped

- MEMORY.md rewrite / MemRoOS-first replacement
- Claude / Codex harness hooks
- Voyage embedding provider enablement

## Verification

- Vitest `src/lib/native-memory/__tests__/`: 8 passed
- Pytest plugin tests: 7 passed
- Hermes `load_memory_provider("memroos")` OK
- `bash scripts/install-hermes-memroos-memory.sh --check` OK (provider inactive by default)
