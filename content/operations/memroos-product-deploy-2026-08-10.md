---
name: "memroos-product-deploy-2026-08-10"
title: "MemroOS product deployment closeout — 2026-08-10"
description: "Verification record for the clean main deploy to both operator hosts."
date: "2026-08-10"
model: "gpt-5.6"
sources:
  - "git commits 415133e8 and 9316fe52"
  - "npm run test:fast"
  - "npm run typecheck"
  - "npm run lint"
  - "scripts/verify-onboarding-deploy.sh"
  - "host-local deployment checks on oracle-1 and cordant-hermes-01"
derived_from: "Clean main deployment, roadmap merge, and responsive engagement QA"
regen_prompt: "Re-run the repository verification gates, reconcile only verified branches, deploy main to both operator hosts with the documented wrapper, and record final commit, container, health, and onboarding results without storing credentials."
---

# Deployment result

- Product main was clean, branch-reconciled, and finally pushed at merge commit 9316fe52338389a60f09fa5cf8f46a6573416333. The runtime/UI change was first pushed as 415133e8; the final merge reconciled the already-present v8.41 roadmap/spec history.
- Stale local worktrees and branches were removed only after verifying their commits were ancestors or their effective file changes already existed on main. The remaining remote planning branch was merged and then deleted.
- Full fast suite passed: 509 files passed, 2 skipped; 4,185 tests passed, 55 skipped.
- Typecheck passed. Lint passed with zero errors and 91 pre-existing warnings.
- Responsive Playwright QA passed at 1440px and 390px with no horizontal overflow. Engagement selection, room add/remove/clear, and visible test/send controls were verified.
- The topology SVG invalid height="auto" console error was removed; the browser console was clean for the flow smoke.
- Oracle and Cordant pulled the final merge commit, rebuilt the MemroOS image, and restarted through scripts/memroos-restart.sh.
- Both hosts report final commit 9316fe52338389a60f09fa5cf8f46a6573416333 and a healthy memroos-local-memroos-1 container.
- Public /api/health returned HTTP 200 for both operator URLs. Host-local checks returned HTTP 200 for mem0, orchestration, and connmem on both hosts; graph memory was up in the aggregated health response.
- Onboarding probes returned the expected HTTP 403 responses for invalid and structurally invalid tokens on both hosts. No 401 proxy regression was observed.
- RTK and QMD remain intentionally degraded optional local tools; mem0, graph memory, agents, APO, and connmem were up on both hosts.

No credentials, tokens, or private configuration values are included.

## Revalidation run — 2026-08-10

- Local `main`, `origin/main`, Oracle, and Cordant all remained at `9316fe52338389a60f09fa5cf8f46a6573416333`; local and both host worktrees were clean.
- The documented pull/build/restart wrapper completed successfully on `oracle-1` and `cordant-hermes-01` (Docker build cache was valid; Cordant recreated the app container).
- Public verifier passed for both URLs: onboarding probes returned expected HTTP 403, structurally invalid signatures returned the expected signature error, and public health returned HTTP 200.
- Host-local verifier passed on both hosts: memroos-app, mem0-memory, orchestration-service, and connmem each returned HTTP 200.

No credentials or tokens were included.
