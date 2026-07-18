# Observe Capture Depth Policy

- **Document version:** 2026-07-18.1
- **Creation date/time (UTC):** 2026-07-18T07:10:00Z
- **Update date/time (UTC):** 2026-07-18T07:10:00Z
- **Sources:** `.planning/ROADMAP.md` § v8.16 Phase 167, OBSERVE-01..03, `apps/memroos/src/lib/observe-capture-depth.ts`

## Depth table

| Depth | Env / request | What is indexed (candidates) | Vault |
|-------|---------------|------------------------------|-------|
| `summary` | Minimal | Summary + limited errors/verification | Receipt only (no transcript) |
| **`relevant` (DEFAULT)** | Balanced | Summary + decisions/actions/files/errors | Sealed structured capture; **no full chat** |
| `full` | Opt-in | Same as relevant structured fields | Sealed fuller transcript/events under `full_transcript` retention |

## Controls

- Request field: `captureDepth` on `POST /api/agent-memory/capture`
- Env override: `MEMROOS_CAPTURE_DEPTH=relevant|summary|full`
- Default when unset: `relevant`
- Raising depth is a config/policy change, not a schema break

## Rules

1. Secrets never enter indexes (existing content scanner + redaction).
2. `relevant` must not index full transcript text into durable candidates.
3. `full` may seal transcript text in the raw vault with retention label; candidates remain structured.
4. Do not dump every chat turn into llm-wiki (pairs with v8.14 digest).
