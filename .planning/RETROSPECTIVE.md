# Retrospective: Agent Kitchen

---

## Milestone: v1.1 — Knowledge Architecture + Dashboard Polish

**Shipped:** 2026-04-11
**Phases:** 5 | **Plans:** 12 | **Timeline:** 3 days (2026-04-08 → 2026-04-11)
**Files changed:** 154 | **Insertions:** 33,429

### What Was Built

1. Obsidian vault + llm-wiki + gitnexus wired into Library with doc count, freshness dates, and weekly cron
2. `knowledge-curator.sh` 5-step nightly pipeline — gitnexus analyze, llm-wiki check, mem0 export, QMD+Qdrant indexing, transcript ingestion — 3,115+ Qdrant Cloud docs
3. mem0 SessionStart hook — agents start each Claude Code session with relevant preloaded context
4. Flow diagram: 4-row layout, 21 nodes, label truncation fixed, Knowledge Curator + Obsidian hub nodes, 9 new data-flow edges, heartbeat panel with path traversal guard, noise-stripped activity feed
5. Personal knowledge ingestion: email threads (replied-to) → Obsidian daily notes + Qdrant; calendar events → mem0; Google Meet + Spark transcripts pipeline; 6h email cron + nightly transcript cron

### What Worked

- **GSD workflow discipline** — Phase plans with PLAN/EXECUTE/VERIFY/UAT kept execution focused; each phase had clear success criteria that drove automated verification
- **Playwright automated verification** — Phase 04 Playwright testing of 7 FLOW requirements eliminated human visual checks for UI correctness; faster and more reliable than manual review
- **Non-fatal guard pattern** in shell scripts (`|| log "Warning..."`) — consistent across all 5 knowledge-curator.sh steps, made the orchestrator resilient without complexity
- **TDD in Phase 01 and 04** — CollectionCard freshness date and cleanMessage utility both developed RED→GREEN, caught edge cases before integration
- **Vitest + @vitest-environment node docblock** for Next.js route tests — resolved the jsdom/Node environment mismatch that typically trips up Next.js testing

### What Was Inefficient

- **ROADMAP.md stale throughout** — Progress table showed phases 2-4 as "In Progress" / "Not Started" even after completion; requires manual update discipline or tooling improvement
- **REQUIREMENTS.md stale checkboxes** — KNOW-05 and FLOW-01..07 shipped but never checked off; the 3-source cross-reference in audit caught this but it added friction
- **Phase 02 and 04 missing VERIFICATION.md** — Had to retroactively create these during the v1.1 audit; `gsd-verify-work` should be run at phase close, not deferred to audit time
- **RTK hook mangling npm args** — `npm run dev -- --port 3002` got mangled by RTK proxy to `npm run -- dev --port 3002`; needed `rtk proxy npx next start` workaround
- **Cloudflare + dev server incompatibility** — HMR WebSocket 502 from Cloudflare triggered infinite reload loop, masking all React hydration; root cause took investigation time; documented for future: always use production build for Cloudflare

### Patterns Established

- **knowledge-curator.sh step pattern** — numbered `[N/M]` labels + non-fatal `|| log "Warning..."` guards; easy to add steps without breaking the pipeline
- **ingestion-state.json watermark pattern** — atomic write via `os.replace()`, JSON per-source with `last_run` ISO timestamps and ID sets; prevents re-processing across runs
- **Qdrant indexing with stable hash IDs** — `hashlib.md5(relative_path)` for idempotent upserts; safe to re-run without duplicating points
- **Phase 04 → Phase 05 node stat update protocol** — when Phase 05 added Step 5 to knowledge-curator.sh, the canvas `"Steps": 4` stat in react-flow-canvas.tsx became stale; caught in integration audit, now documented as a cross-phase dependency

### Key Lessons

- Run `/gsd-verify-work` at phase close, not at milestone audit — creates VERIFICATION.md while evidence is fresh
- Keep ROADMAP.md progress table accurate — stale status causes confusion during audit
- Check REQUIREMENTS.md checkbox parity when completing each phase — don't let 8 requirements pile up as stale `[ ]`
- Production build is non-negotiable for Cloudflare — document in CLAUDE.md at project start
- RTK proxy intercepts npm commands — use `rtk proxy` prefix for commands with `--` arg passthrough

### Cost Observations

- Model mix: Sonnet primary for implementation, Opus for architecture/analysis (research, planning)
- Sessions: ~4 sessions over 3 days
- Notable: Phase 05 (5 plans, full Python pipeline) completed in a single day — GSD plan structure made parallel work streams clear

---

## Cross-Milestone Trends

| Metric | v1.1 |
|--------|------|
| Phases | 5 |
| Plans | 12 |
| Days | 3 |
| Files changed | 154 |
| Requirements hit | 12/12 |
| UAT issues | 0 |
| Tech debt items | 7 |
