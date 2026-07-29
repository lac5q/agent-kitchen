# BM-20260720-0120 phase-0-oracle-baseline
- Director/Lead: me (claude-opus/high) inline, no fan-out
- Watcher/Adversarial Validator: n/a this phase (baseline only, no code changes)
- Executor: n/a (no code written)
- Harness: manual SSH to oracle-1
- Acceptance checks: oracle-1 process list, port list, env, code grep, sqlite via python3.11
- Result: pass (baseline captured; gaps confirmed)
- Token/cost note: minimal — bash only
- Watcher fallback chain (v2.5.2): n/a
- Effective Watcher: n/a
- What worked: oracle-1 ssh works; loopback bypass works for routes in `ROUTE_LOCAL_AUTH_API_ROUTES` AND `/api/health`; /api/memory/health is in the local-auth list so it returns 200 on loopback; python3.11 sqlite3 used as fallback for missing `sqlite3` CLI
- What failed / drifted:
  1. **MEMX-2 audit doc was wrong.** The Jul 19 audit claimed `loopback is exempt from operator-key check per operator-auth.ts:37` — true for the route handler, but the Next.js **proxy** (`src/proxy.ts`) runs BEFORE the route and requires human JWT OR a route in `ROUTE_LOCAL_AUTH_API_ROUTES`. `/api/cron-health` is NOT in that list, so GET and POST both 401 from loopback. This is a new finding → **MEMX-8**.
  2. `MEMROOS_OPERATOR_API_KEY` IS in `/etc/memroos/web.env` now — that part of MEMX-2 was done. Just blocked by the proxy layer.
  3. `vault_artifact` table genuinely missing. Only `memory_vault_durability` exists. MEMX-7 confirmed.
  4. 24,886 messages `consolidated=1` but only 2,614 insights → 10% yield. Confirms both MEMX-3 (gating) and MEMX-4 (parser).
  5. oracle-1 has no `sqlite3` CLI; `python3.11` sqlite3 works as fallback.
  6. 3 zombie `mcp_server.py` processes on main-mac still running (PIDs 60946, 6875, 60683).
- Routing rule to change: no — single discovery
- Skill/config update needed: yes — `~/github/knowledge/skill-runtimes/hermes/devops/memroos-operations/references/oracle-1-memroos-status-audit-2026-07-19.md` is stale on the loopback-bypass claim. Update after Phase 5.

## Baseline numbers (oracle-1, captured 2026-07-20 ~01:20 UTC)

| Metric | Value | Implication |
|---|---|---|
| `last_ingest_ts` | 2026-07-05T18:15:21Z (342h stale) | MEMX-1 confirmed |
| `consolidated=1` | 24,886 / 128,597 (19%) | MEMX-3 data loss risk |
| `consolidated=0` | 103,711 | queue waiting |
| `memory_meta_insights` | 2,614 | MEMX-4 parser issue |
| `vault_artifact` | MISSING | MEMX-7 confirmed |
| `memory_vault_durability` | exists | unrelated durability table |
| oracle-1 memroos-web | running (PID 1179849, next-server v16.2.7) | ✅ |
| oracle-1 memroos-mem0 | running (PID 1183297) | ✅ |
| oracle-1 ollama | running | ✅ |
| oracle-1 cloudflared | running (memroos-oracle tunnel) | ✅ |
| oracle-1 Neo4j | up (per /api/memory/health) | ✅ |
| `/api/cron-health` GET/POST | 401 from loopback | ❌ MEMX-8 |
| Mac zombie `mcp_server.py` procs | 3 (PIDs 60946, 6875, 60683) | Phase 2 cleanup |

## New ticket: MEMX-8 — proxy auth gate on /api/cron-health

**File:** `apps/memroos/src/proxy.ts`
**Root cause:** `ROUTE_LOCAL_AUTH_API_ROUTES` does not include `/api/cron-health`. The proxy (`enforceAuth` line ~120) runs before the route handler and returns 401 because (a) no human JWT in header/cookie and (b) the path is not exempted. The audit doc's claim about loopback exemption applied only to the route's own `authorizeRegistryWrite` check on the POST handler — the proxy blocks it first.
**Fix:** add `{ pattern: /^\/api\/cron-health$/ }` to `ROUTE_LOCAL_AUTH_API_ROUTES`. Same logic as `/api/recall/ingest` (line 117 of proxy.ts) — the route handler does its own operator-key check via `authorizeRegistryWrite`. The GET handler does no auth check at all (it just reads jobs from sqlite) — still safe to expose on loopback because the proxy already prevents external callers without a JWT.
**Smoke:** after deploy + restart `memroos-web`, `curl -fsS http://127.0.0.1:3000/api/cron-health` returns 200 with jobs+summary.