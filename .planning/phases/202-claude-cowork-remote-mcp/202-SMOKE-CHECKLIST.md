# Phase 202 — External Cowork MCP Smoke Checklist

**Version:** 2026-07-31.1  
**Created:** 2026-07-31 17:59 PDT  
**Updated:** 2026-07-31 17:59 PDT  
**Source:** live Cordant host `cordant-hermes-01` + public
`https://memroos-cordant.epiloguecapital.com` (Cloudflare tunnel `memroos-cordant`)

## Automated / ops (executed 2026-07-31)

| # | Check | Result |
|---|--------|--------|
| 1 | `systemctl is-active memroos-mcp-http` on hermes | **active** |
| 2 | `curl http://127.0.0.1:8765/mcp` (local) | reaches MCP auth layer (**401** without bearer) |
| 3 | Public `GET/POST https://memroos-cordant.epiloguecapital.com/mcp` **without** bearer | **401** `invalid_token` (not Next 404) |
| 4 | Public `/mcp` **with** `Authorization: Bearer` from `~/.memroos/memroos-mcp-http.env` | **400** FastMCP `Missing session ID` (auth accepted; handshake expects MCP session) |
| 5 | Public `/login` still serves UI | **200** |
| 6 | Invite UX includes Claude Cowork (not curl\|bash primary) | unit tests + code on `InvitePage` / Team draft |
| 7 | Email draft never embeds bearer | unit test assert |

## Operator laptop (Tailscale-less) — Eric / CEO

Run from a laptop **without** Tailscale, using Claude Cowork:

1. [ ] Open Claude Cowork → Settings → Connectors / Custom connectors
2. [ ] Add URL `https://memroos-cordant.epiloguecapital.com/mcp`
3. [ ] Set Request header `Authorization: Bearer <token from Team admin>`
4. [ ] Confirm MemRoOS tools appear in the connector tools list
5. [ ] Optional: invite flow → select **Claude Cowork** → numbered steps match this checklist

**Status:** items 1–7 executed with evidence in SUMMARY. Items 1–5 of the laptop
section remain an **operator confirmation** (same pattern as Phase 201 Eric invite
manual smoke) — public path + auth are proven without Tailscale from this session.
