---
phase: 186-production-topology-profile
plan: 01
subsystem: infra
tags: [topology, TOPOPROD, systemd, oracle-1]

requires: []
provides:
  - production profile in runtime-topology.json
  - check:runtime-topology validates deploy/oracle-1 systemd units
  - verify-onboarding-deploy.sh post-deploy profile health
affects: [185-connmem, production-deploys]

tech-stack:
  added: []
  patterns:
    - Profile-keyed topology manifest; production gate reads deploy/oracle-1/systemd

key-files:
  modified:
    - apps/memroos/src/lib/runtime-topology.json
    - scripts/check-runtime-topology.mjs
    - scripts/verify-onboarding-deploy.sh
    - deploy/oracle-1/systemd/*

requirements-completed: [TOPOPROD-01, TOPOPROD-02, TOPOPROD-03, TOPOPROD-04]
duration: closeout
completed: 2026-07-31
---

# Phase 186: Production Topology Profile Summary

**Oracle-1 production profile is gated in CI against committed systemd units under deploy/oracle-1/**

## Evidence (2026-07-31 closeout)

```text
npm run check:runtime-topology -- production
→ ok: true
→ checked systemd units for memroos-app, mem0, orchestration, connmem, knowledge-mcp, healthcheck
```

- TOPOPROD-01: `profiles.production` present in `runtime-topology.json`
- TOPOPROD-02: gate requires `deploy/oracle-1/systemd/*.service`
- TOPOPROD-03/04: `verify-onboarding-deploy.sh` documents profile health + calls topology gate (field-landed earlier; re-verified gate path)

## Requirements

| ID | Status |
|----|--------|
| TOPOPROD-01 | ✅ |
| TOPOPROD-02 | ✅ |
| TOPOPROD-03 | ✅ (docs + manifest consumers aligned via prior PR #51 repairs) |
| TOPOPROD-04 | ✅ verify-onboarding-deploy.sh profile extension |

---
*Phase: 186-production-topology-profile*
*Completed: 2026-07-31*
