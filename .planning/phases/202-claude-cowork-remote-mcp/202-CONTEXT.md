# Phase 202: Claude Cowork Remote MCP (Cordant) - Context

**Gathered:** 2026-07-31  
**Updated:** 2026-07-31T23:20:02Z  
**Status:** Ready for discuss/plan (ops + product)  
**Milestone:** v8.32 Easy Human + Agent Onboarding  
**Document version:** 1.0  
**Creation date:** 2026-07-31  
**Update date:** 2026-07-31T23:20:02Z  

**Sources:** Anthropic MCP 2026-07-28 / Cowork custom-connector docs; repo `docs/integrations/mcp.md`, `docs/production-deployment.md`; Phase 201 CONTEXT D-13..D-15; operator request (CEO/workers use Cowork, no Tailscale).

<domain>
## Phase Boundary

Enable Cordant humans whose primary client is **Claude Cowork** to use MemRoOS
on **cordant-hermes-01** without Tailscale and without installing a local MCP
process.

Phase 201 already ships: invite → Connect → curl|bash for Claude Code / Cursor /
Codex / etc., with public commands on
`https://memroos-cordant.epiloguecapital.com`. That path does **not** work for
Cowork (remote connector only; Anthropic cloud originates the connection).

### In scope
- Public Streamable HTTP MCP reachable from Anthropic via the Cordant Cloudflare
  hostname (path `/mcp` preferred to match existing `mcpUrl` minting)
- Run/keep knowledge-mcp (or equivalent HTTP facade) on hermes behind that route
- Auth suitable for Claude custom connectors (Request header bearer and/or
  Cloudflare Access / OAuth)
- Invite Connect + Team email draft: **Claude Cowork** instructions (deep link
  and/or numbered connector steps) as a first-class harness path
- Optional Claude plugin packaging the remote MCP URL + SETUP skill
- External smoke checklist for a Tailscale-less laptop

### Out of scope
- Tailscale for workers (explicitly not required)
- Desktop `.mcpb` extensions as the Cowork solution (Desktop/Claude Code only)
- Public Anthropic Connectors Directory listing (private Cordant brain)
- Anthropic MCP tunnels research-preview (Managed Agents/API; not Cowork connectors)
- oracle-1 / `memroos.epiloguecapital.com` as Eric’s brain
- SendGrid live mail (still Phase 183b)
- Replacing Phase 201 Claude Code curl|bash (keep both)

</domain>

<decisions>
## Implementation Decisions

### Host / reachability (locked from Phase 201 + ops 2026-07-31)
- **D-01:** Target host remains **cordant-hermes-01**, public URL
  `https://memroos-cordant.epiloguecapital.com`, tunnel `memroos-cordant`
  (`a5016402-755f-42a5-aebe-be028bdb1660`).
- **D-02:** Cloudflare Tunnel for the **operator UI** is already live →
  `http://127.0.0.1:3000`. Phase 202 must extend public reachability to MCP
  (today the tunnel does **not** publish `:8765` / `/mcp`).
- **D-03:** Prefer routing **`/mcp` on the same hostname** to local Streamable
  HTTP MCP (matches `createAgentOnboardingToken` default
  `${memroosUrl}/mcp`) unless ops prefers a dedicated hostname.
- **D-04:** Workers do **not** need Tailscale.

### Cowork client path (proposed — confirm in discuss)
- **D-05:** Primary UX = Claude **custom connector** (Team/Enterprise: Owner adds
  once; members Connect) and/or deep link:
  `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=MemRoOS&connectorUrl=...`
- **D-06:** Optional Claude **plugin** that references the same remote MCP URL
  (plugins work in Cowork when they bundle remote MCP).
- **D-07:** Do **not** treat local Desktop extensions as the Cowork solution.

### Auth (proposed — confirm in discuss)
- **D-08:** Must not leave full knowledge/memory write surface anonymously public.
- **D-09:** v1 candidates (pick one in plan): (a) `Authorization: Bearer` via
  Claude connector Request headers + rotateable token; (b) Cloudflare Access in
  front of `/mcp`; (c) OAuth-capable proxy. Reuse patterns from
  `docs/integrations/mcp.md` ChatGPT HTTP installer where useful.
- **D-10:** Agent identity / `owner_id` for Cowork sessions should align with
  Phase 201 ownership model where practical (may be shared team connector +
  per-user Access identity in v1 — planner discretion).

### Claude's Discretion
- Exact cloudflared ingress config (path rewrite vs second public hostname)
- Whether knowledge-mcp runs via systemd, docker-compose.local addition, or
  LaunchAgent-equivalent on Linux
- Whether invite UI adds platform id `cowork` / `claude-cowork` or reuses
  `claude` with alternate instruction block
- How far to go on plugin packaging in the same plan vs a thin follow-up

</decisions>

<specifics>
## Operator-visible journey (target)

```
CEO/worker opens Cowork
  → Connectors → MemRoOS (custom / plugin / deep link)
  → Anthropic cloud → https://memroos-cordant.epiloguecapital.com/mcp
  → Cloudflare Tunnel → hermes knowledge-mcp (Streamable HTTP)
  → MemRoOS tools (knowledge / memory / progressive discovery)
```

No Tailscale. No local `memroos-mcp.sh` on the laptop.

## Known gap vs Phase 201 minting

Onboarding tokens already set `mcpUrl` to `${publicUrl}/mcp`. Until COWORK-01
ships, that URL is not a working public Streamable HTTP endpoint for Anthropic
(even though the operator UI on the same host is live).

## Plugin answer (research)

Yes, there is a plug-in-shaped path: a Claude plugin that **references a remote
MCP URL** works in Cowork. It does **not** remove the need for a public HTTPS
MCP. Desktop `.mcpb` alone does not.

</specifics>

<canonical_refs>
## Canonical References

- `docs/integrations/mcp.md` — stdio + Streamable HTTP + ChatGPT public installer
- `docs/production-deployment.md` — Cordant tunnel live notes
- `scripts/memroos-mcp.sh` / `npm run mcp:http` / `scripts/install-chatgpt-mcp-launchd.sh`
- `apps/memroos/src/lib/agent-onboarding.ts` — `mcpUrl` default `${memroosUrl}/mcp`
- `.planning/phases/201-invite-multi-harness-agent-bootstrap/201-CONTEXT.md` — D-13..D-15
- Anthropic: custom connectors (remote MCP), desktop vs web connectors, plugins + remote MCP

</canonical_refs>

<code_context>
## Existing Code / Ops Insights

- Tunnel live for `:3000` only (2026-07-31).
- `docker-compose.local.yml` on hermes deliberately avoids pulling in the full
  `knowledge-mcp` service set from root `docker-compose.yml` — plan must choose
  how MCP runs on hermes without breaking that constraint.
- ChatGPT MCP LaunchAgent pattern is macOS-oriented; hermes needs a Linux
  systemd (or container) equivalent.

</code_context>

<deferred>
## Deferred Ideas

- Directory submission / public listing
- MCP Apps interactive UI
- Anthropic MCP tunnels for private-only access
- Per-seat OAuth identity fully replacing shared bearer

</deferred>
