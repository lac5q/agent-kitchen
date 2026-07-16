# Goal: Hermes dual-mode memory (opt-in MemRoOS mirror)

- Created: 2026-07-16T21:40:00Z
- Updated: 2026-07-16T21:40:00Z
- Version: 2026-07-16.1
- Status: local-only (`MEMROOS_APP_URL` unset)
- Lane: code + safety
- Requirements: ENTOPS-07 (Hermes opt-in slice)

## Goal statement

Let Luis test MemRoOS-governed memory on local Hermes **without replacing** built-in MEMORY.md. Default Hermes behavior stays unchanged. MemRoOS attaches only when explicitly enabled as a Hermes memory provider (additive plugin). Voyage/other embeddings clarified as **cloud API** options — not local Mac models.

## Product decisions (locked)

1. **Do not change Hermes harness memory by default.** Built-in MEMORY.md / USER.md remain source of local truth.
2. **Support both:** built-in always on; MemRoOS optional external provider (`memory.provider: memroos`).
3. **First phase mode = `observe` (mirror):** MemRoOS receives copies of built-in writes via `on_memory_write` → `/api/native-memory/ingest`. Never rewrites MEMORY.md.
4. **`governed` / rewrite-local is deferred** until observe mode proves safer long-term.
5. **Voyage** (if ever enabled) runs as remote HTTP API behind embedding flags — not on the Mac. Ollama local remains optional; no local model required for this goal.

## Acceptance criteria

1. With MemRoOS provider **off**, Hermes memory behavior is unchanged (no plugin load required).
2. With `memory.provider: memroos` + `mode: observe`, built-in writes still succeed; MemRoOS ingest receives mirrored content when operator URL + API key are set.
3. Ingest failures never break Hermes memory writes (fail-open for mirror path).
4. MEMORY.md skills-routing layer is never modified by the plugin.
5. Install script can symlink the MemRoOS plugin into a Hermes checkout without forking Hermes.
6. Unit tests cover client + observe semantics; Vitest covers sink contract still green.
7. Docs explain dual-mode + where Voyage would run (cloud).

## Verification

```bash
cd apps/memroos && npx vitest run src/lib/native-memory/__tests__/
python -m pytest integrations/hermes/plugins/memory/memroos/tests/ -q
bash scripts/install-hermes-memroos-memory.sh --check
```

## Out of scope

- Claude / Codex harness wiring
- Forced MemRoOS-first rewrite of MEMORY.md
- Voyage embedding provider implementation
- MSIQ-06 GraphRAG spike
- IdP / MDM ENTOPS-04/05
