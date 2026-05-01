# Requirements: Agent Kitchen v1.7 — Progressive Tool Gateway Runtime

*Last updated: 2026-05-01*

---

## Status

v1.7 is in progress. Phase 29 is complete.

See `.planning/milestones/v1.6-REQUIREMENTS.md` for the archived v1.6 checklist.

---

## Requirements

### Tool Gateway Runtime

- [x] **TOOLGW-01** — Expose `tool_catalog`, `tool_discover`, `tool_load`, `tool_record_outcome`, and `tool_stats` as top-level Knowledge MCP tools.
- [x] **TOOLGW-02** — Keep the workspace-based `knowledge_workspace_call("tool-attention", ...)` path backward-compatible while routing direct callers to the top-level tools.
- [ ] **TOOLGW-03** — Add task-scoped recommendation metadata that distinguishes MCP servers, workspaces, skills, references, and unavailable candidates.

### Memory-Aware Selection

- [x] **MEMGW-01** — Use recorded outcomes to compute success/failure counts by capability.
- [x] **MEMGW-02** — Include recent outcome signals in `tool_discover` ranking without exposing private task text.
- [ ] **MEMGW-03** — Add a memory-backed context hook for "similar task used these tools" recommendations.

### Kitchen Operations UI

- [ ] **UIGW-01** — Show gateway-level stats, recent outcomes, and degraded sources in a dedicated Tool Gateway operations view.
- [ ] **UIGW-02** — Add source/capability filters for type, status, and top-level/runtime availability.
- [ ] **UIGW-03** — Surface loaded/skipped/recorded outcome trends in the Flow Tool Gateway node detail panel.

### Hardening

- [ ] **OPSGW-01** — Fix full-repo lint debt enough to make `npm run lint` enforceable in CI.
- [ ] **OPSGW-02** — Resolve or isolate the non-blocking Turbopack NFT warning in production build.
- [ ] **OPSGW-03** — Add CI coverage for the top-level Knowledge MCP tool gateway.

---

## Future Requirements

- LLM-powered relevance scoring for recall results
- Memory export/import between agent instances
- Cross-project recall across multiple local projects
- Voice meeting bot integration
- Update flow trigger button to kick off the knowledge update pipeline from UI
- Library freshness: show last indexed timestamp vs file mtime

---

## Out of Scope

- Structured task format experiments with Rust/WASM
- Multi-user auth
- Mobile app
- GitNexus embeddings until the upstream local embedding crash is fixed

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| TOOLGW-01 | 29 | Complete |
| TOOLGW-02 | 29 | Complete |
| TOOLGW-03 | 30 | Pending |
| MEMGW-01 | 30 | Complete |
| MEMGW-02 | 30 | Complete |
| MEMGW-03 | 30 | Pending |
| UIGW-01 | 31 | Pending |
| UIGW-02 | 31 | Pending |
| UIGW-03 | 31 | Pending |
| OPSGW-01 | 32 | Pending |
| OPSGW-02 | 32 | Pending |
| OPSGW-03 | 32 | Pending |
| MONO-01 | 26 | Complete |
| MONO-02 | 26 | Complete |
| MONO-03 | 26 | Complete |
| MONO-04 | 26 | Complete |
| MONO-05 | 26 | Complete |
| MCP-01 | 27 | Complete |
| MCP-02 | 27 | Complete |
| MCP-03 | 27 | Complete |
| TOOL-01 | 27 | Complete |
| TOOL-02 | 27 | Complete |
| UI-01 | 27 | Complete |
| UI-02 | 27 | Complete |
| UI-03 | 27 | Complete |
| UI-04 | 27 | Complete |
| OPS-01 | 28 | Complete |
| OPS-02 | 28 | Complete |
| OPS-03 | 28 | Complete |
