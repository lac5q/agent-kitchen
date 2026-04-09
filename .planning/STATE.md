# State: Agent Kitchen

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-09)

**Core value:** Every agent and knowledge system is visible, connected, and self-improving.
**Current focus:** v1.1 Phase 1 — Knowledge Foundations

## Current Position

Phase: 1 of 4 (Knowledge Foundations)
Plan: — of — (not yet planned)
Status: Ready to plan
Last activity: 2026-04-08 — Roadmap created for v1.1

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*

## Accumulated Context

### Decisions

- Production runs on port 3002 via `npm start -- --port 3002`; kill existing: `lsof -ti :3002 | xargs kill -9`
- After any build change: rebuild with `npm run build` then restart
- base-ui tooltip: use `className` prop not `asChild` on TooltipTrigger
- Agents config: agents.config.json at project root (not hardcoded)
- Collections config: collections.config.json at project root
- Remote agents Lucia=localhost:3001, Alba=localhost:18793 (both local, not Tailscale)
- GitNexus AGENTS.md injected — run `npx gitnexus analyze` after commits
- Phase 4 depends on Phase 1 (not Phase 3) — Flow work can proceed in parallel with mem0 preload

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-04-08
Stopped at: Roadmap created — ready to begin Phase 1 planning
Resume file: None
