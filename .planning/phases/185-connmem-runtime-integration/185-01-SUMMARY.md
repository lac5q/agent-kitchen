---
phase: 185-connmem-runtime-integration
plan: 01
subsystem: api
tags: [connmem, CONNMEM-RT, CI, proxy]

requires:
  - phase: 176
    provides: connmem library + release gate checks
provides:
  - Supervised FastAPI connmem service + compose/topology
  - CI pytest for services/connmem/tests
  - /api/connmem/{status,sync,ledger} kernel seam with proxy allowlist
  - /api/health connmem probe
affects: [v8.20-live-backfill, 186-topology]

tech-stack:
  added: []
  patterns:
    - Agent-auth kernel proxy to FastAPI sidecars via ROUTE_LOCAL_AUTH_API_ROUTES

key-files:
  created:
    - apps/memroos/src/app/api/connmem/ledger/route.ts
  modified:
    - apps/memroos/src/proxy.ts
    - scripts/check-route-auth-boundary.mjs
    - apps/memroos/src/app/api/health/route.ts
    - docker-compose.local.yml

key-decisions:
  - "RT-05 recursive skip when CONNMEM_URL unset is intentional; external run_gate(include_runtime_reachable=True) + /health+/v1/ledger probes exist"
  - "Health reports connmem as degraded (not hard-down) when stack omits the service (e.g. hermes)"

requirements-completed: [CONNMEM-RT-01, CONNMEM-RT-02, CONNMEM-RT-03, CONNMEM-RT-04, CONNMEM-RT-05]
duration: closeout
completed: 2026-07-31
---

# Phase 185: Connmem Runtime Integration Summary

**Connmem is a supervised FastAPI service with CI, topology, agent-auth kernel routes, release-gate reachability, and /api/health visibility**

## Evidence (2026-07-31 closeout)

| Check | Result |
|-------|--------|
| `pytest services/connmem/tests` | **144 passed** |
| CI workflow `Run connmem tests` | present in `.github/workflows/ci.yml` |
| `npm run check:runtime-topology` | ok (connmem registered) |
| `npm run check:route-auth-boundary` | ok after RT-04 allowlist (`bcbe692e`) |
| oracle `GET :3290/health` | `{"status":"ok","service":"connmem"}` |
| oracle `GET :3290/v1/release-gate` | `overall_passed: true` |
| oracle `GET :3290/v1/ledger` | 200 |
| Kernel routes | `/api/connmem/status`, `sync/[source]`, `ledger` + proxy allowlist |
| `/api/health` | includes `connmem` probe (degraded if omitted) |

## Requirements

| ID | Status |
|----|--------|
| CONNMEM-RT-01 | ✅ FastAPI+uvicorn entrypoint + Dockerfile + systemd |
| CONNMEM-RT-02 | ✅ CI pytest |
| CONNMEM-RT-03 | ✅ topology + compose |
| CONNMEM-RT-04 | ✅ kernel seam + proxy allowlist + boundary coverage |
| CONNMEM-RT-05 | ✅ `check_runtime_reachable` + `/v1/release-gate` wiring |

## Still blocked for *live* Linear/Circleback backfill

Provider OAuth credentials (`CONNMEM-LIVE-DEFER`) — not a Phase 185 runtime gap.

## Not claimed

- Phase 202 Cowork MCP UX
- hermes always running connmem (optional there)

---
*Phase: 185-connmem-runtime-integration*
*Completed: 2026-07-31*
