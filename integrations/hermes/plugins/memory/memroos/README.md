# MemRoOS Hermes memory provider

Opt-in dual-mode memory for Hermes Agent.

- **Default:** do not enable this provider — Hermes built-in MEMORY.md only.
- **Observe mode:** mirror built-in writes to MemRoOS `POST /api/native-memory/ingest`; never rewrite MEMORY.md.
- **Disable:** `hermes memory off`

See `docs/integrations/hermes-memory-dual-mode.md` in the MemRoOS repo.
