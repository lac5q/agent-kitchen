# MemRoOS Hermes memory provider

Opt-in dual-mode memory for Hermes Agent.

- **Default:** do not enable this provider — Hermes built-in MEMORY.md only.
- **Observe mode:** mirror built-in writes to MemRoOS `POST /api/native-memory/ingest`; never rewrite MEMORY.md.
- **Disable:** `hermes memory off`

See `docs/integrations/hermes-memory-dual-mode.md` in the MemRoOS repo.

When installed by `scripts/install-agent-integrations.sh`, the provider also
exposes Hermes lifecycle equivalents: `on_session_start` runs the bounded
memory brief and `on_session_end` / `on_pre_compact` run the fail-open capture
gate. Missing hook files, timeouts, and capture failures never block Hermes;
the shared hook receipts remain the diagnostic surface.
