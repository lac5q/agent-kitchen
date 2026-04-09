# State: Agent Kitchen

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-09)

**Core value:** Every agent and knowledge system is visible, connected, and self-improving.
**Current focus:** v1.1 — Knowledge Architecture + Dashboard Polish

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-09 — Milestone v1.1 started

## Accumulated Context

- Production runs on port 3002 via `npm start -- --port 3002`
- Kill existing: `lsof -ti :3002 | xargs kill -9`
- After any build change: rebuild with `npm run build` then restart
- base-ui tooltip: use `className` prop not `asChild` on TooltipTrigger
- Agents config: agents.config.json at project root (not hardcoded)
- Collections config: collections.config.json at project root
- Remote agents Lucia=localhost:3001, Alba=localhost:18793 (both local, not Tailscale)
- GitNexus AGENTS.md injected — run `npx gitnexus analyze` after commits
