---
name: "memroos-product-deploy-2026-08-10"
title: "MemroOS product deployment closeout — 2026-08-10"
description: "Verification record for the clean main deploy to both operator hosts."
date: "2026-08-10"
model: "gpt-5.6"
sources:
  - "git commit 415133e8"
  - "npm run test:fast"
  - "npm run typecheck"
  - "npm run lint"
  - "scripts/verify-onboarding-deploy.sh"
  - "host-local deployment checks on oracle-1 and cordant-hermes-01"
derived_from: "Clean main deployment and responsive engagement QA"
regen_prompt: "Re-run the repository verification gates, deploy main to both operator hosts with the documented wrapper, and record commit, container, health, and onboarding results without storing credentials."
---

# Deployment result

- Product main was clean, branch-reconciled, and pushed at commit 415133e86782fdc4dae6583e405c1001decca1d7.
- Stale local worktrees and branches were removed only after verifying their commits were ancestors or their effective file changes already existed on main.
- Full fast suite passed: 509 files passed, 2 skipped; 4,185 tests passed, 55 skipped.
- Typecheck passed. Lint passed with zero errors and 91 pre-existing warnings.
- Responsive Playwright QA passed at 1440px and 390px with no horizontal overflow. Engagement selection, room add/remove/clear, and visible test/send controls were verified.
- The topology SVG invalid height="auto" console error was removed; the browser console was clean for the flow smoke.
- Oracle and Cordant pulled the same commit, rebuilt the MemroOS image, and restarted through scripts/memroos-restart.sh.
- Both hosts reported the app and required local services healthy. Public /api/health returned HTTP 200 for both operator URLs.
- Onboarding probes returned the expected HTTP 403 responses for invalid and structurally invalid tokens on both hosts. No 401 proxy regression was observed.
- RTK and QMD remain intentionally degraded optional local tools; mem0, graph memory, agents, APO, and connmem were up on both hosts.

No credentials, tokens, or private configuration values are included.
