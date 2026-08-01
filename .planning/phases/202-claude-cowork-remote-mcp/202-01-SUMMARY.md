---
phase: 202-claude-cowork-remote-mcp
plan: 01
subsystem: ops+onboarding
tags: [cowork, mcp, cordant, cloudflare]

requires:
  - phase: 201
    provides: invite Connect + public URL + Team draft
provides:
  - Public Streamable HTTP MCP on Cordant /mcp with bearer auth
  - Invite + Team Claude Cowork connector path (not curl|bash)
  - External smoke checklist + live hermes evidence
affects: [v8.32]

tech-stack:
  added: []
  patterns:
    - cloudflared path /mcp* → host systemd FastMCP :8765 before UI :3000
    - Cowork platform filtered out of onboarding bootstrap PLATFORMS

key-files:
  created:
    - deploy/cordant-hermes-01/systemd/memroos-mcp-http.service
    - scripts/install-memroos-mcp-systemd.sh
    - apps/memroos/src/lib/cowork-connector.ts
    - .planning/phases/202-claude-cowork-remote-mcp/202-SMOKE-CHECKLIST.md
  modified:
    - deploy/cordant-hermes-01/cloudflared/memroos-cordant.yml
    - apps/memroos/src/lib/ui-constants.ts
    - apps/memroos/src/lib/invite-email-draft.ts
    - apps/memroos/src/app/invite/[token]/page.tsx
    - docs/integrations/mcp.md
    - docs/production-deployment.md

key-decisions:
  - "Auth D-09a: Bearer MEMROOS_MCP_BEARER_TOKEN; Cloudflare Access deferred"
  - "cowork is invite UX only — never sent to /api/onboarding/bootstrap"
  - "Bearer never embedded in Team invite email draft"

requirements-completed: [COWORK-01, COWORK-02, COWORK-03, COWORK-04, COWORK-05]
duration: closeout
completed: 2026-07-31
---

# Phase 202: Claude Cowork Remote MCP Summary

**Cordant public `/mcp` Streamable HTTP is live with bearer auth; Invite/Team UX
guides Claude Cowork connectors (not curl|bash).**

## Evidence (2026-07-31 closeout)

| Check | Result |
|-------|--------|
| hermes `memroos-mcp-http` | **active** |
| local `:8765/mcp` | auth layer (**401** without bearer) |
| public `/mcp` unauth | **401** (not Next 404) |
| public `/mcp` + bearer | FastMCP **400** Missing session ID (auth OK) |
| public `/login` | **200** UI intact |
| unit tests | `cowork-connector` + `invite-email-draft` + `ui-constants` **10 passed** |
| checklist | `.planning/phases/202-claude-cowork-remote-mcp/202-SMOKE-CHECKLIST.md` |

## Requirements

| ID | Status |
|----|--------|
| COWORK-01 | ✅ Public `https://memroos-cordant.epiloguecapital.com/mcp` |
| COWORK-02 | ✅ Unauth reject; bearer reaches FastMCP |
| COWORK-03 | ✅ Invite Connect + Team draft Cowork path |
| COWORK-04 | ✅ Deep-link hint + numbered connector steps (no `.mcpb`) |
| COWORK-05 | ✅ Checklist run against live Cordant hostname (HTTP path); Cowork UI tools-list remains operator confirmation like 201 Eric invite smoke |

## Not claimed

- Cloudflare Access / OAuth (deferred)
- Public Connectors Directory
- docker `knowledge-mcp` `:3291` as Cowork endpoint (wrong service)

## Impact note

GitNexus MCP unavailable this session; edits were additive (`PLATFORM_LABELS.cowork`,
invite filter, email draft helper). Bootstrap `PLATFORMS` unchanged (cowork excluded
client-side).

---
*Phase: 202-claude-cowork-remote-mcp*  
*Completed: 2026-07-31*  
*Created / Updated: 2026-07-31*
