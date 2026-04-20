# Requirements: Agent Kitchen v1.6 — TBD

*Last updated: 2026-04-20*

---

## Active Requirements

*No requirements defined yet — run `/gsd-new-milestone` to start the requirements process for v1.6*

---

## Future Requirements (deferred from v1.5)

- LLM-powered relevance scoring for recall results
- Memory export/import between agent instances
- Cross-project recall (query sessions from other projects, not just current)
- Voice meeting bot integration (Pika/Recall.ai video avatars) — ClaudeClaw PP7

---

## Out of Scope

- `.bit` structured task format (zaius-labs) — interesting but adds Rust/WASM complexity with no clear advantage over SQLite FTS5 for this use case; backlog
- Multi-user auth — single-user local tool
- Mobile app — web-first dashboard
- GitNexus embeddings — blocked by upstream node-llama-cpp macOS arm64 bug

---

## Traceability

*Filled in by roadmapper — 2026-04-20*

| REQ-ID | Phase | Status |
|--------|-------|--------|
