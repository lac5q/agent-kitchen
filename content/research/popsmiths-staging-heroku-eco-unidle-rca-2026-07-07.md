---
title: PopSmiths staging Heroku Eco unidle RCA
date: 2026-07-07
model: GPT-5 Codex
sources:
  - heroku ps -a popsmiths-staging
  - heroku logs -a popsmiths-staging --num 220
  - heroku releases -a popsmiths-staging --num 8
  - curl https://staging.popsmiths.com/health
  - curl https://staging.popsmiths.com/create
  - heroku pg:info -a popsmiths-staging
derived_from:
  - PopSmiths staging outage repair request on 2026-07-07
regen_prompt: "Re-check PopSmiths staging Heroku availability, identify why staging looked down, and verify the repair with dyno, log, HTTP, and database surfaces."
---

# PopSmiths staging Heroku Eco unidle RCA

## Summary

On 2026-07-07, `popsmiths-staging` looked down because both staging dynos were on Heroku Eco and had idled. The first requests to `https://staging.popsmiths.com/create` and `/` hit Heroku router `H99 Platform error` while Heroku was unidling the app. Once the dynos finished starting, the app served normally.

## Evidence

- `heroku ps -a popsmiths-staging` showed both `web.1` and `worker.1` running as Eco dynos after unidling.
- Logs showed `Unidling`, then `State changed from down to starting`, followed by `H99 Platform error` for `/create` and `/`.
- The same log stream then showed normal service startup and route success.
- After a clean `heroku restart -a popsmiths-staging`, `https://staging.popsmiths.com/health`, `/create`, and `/` all returned HTTP 200.
- Health reported `database: connected`, `imageService: configured`, and `shopify: configured`.
- `heroku pg:info -a popsmiths-staging` showed the staging database on Essential-0, available, 160 MB of 1 GB, with 1 of 20 connections used.

## Action Taken

- Restarted all staging dynos with `heroku restart -a popsmiths-staging`.
- Verified both `web.1` and `worker.1` were back up.
- Verified the custom staging domain served `/health`, `/create`, and `/`.

## Residual Risk

This was a wake-from-idle failure mode, not a code crash or database-capacity incident. Because the app is still on Heroku Eco dynos, staging can sleep again after inactivity. A permanent always-on fix would require moving staging dynos off Eco, or adding an explicit keep-warm/availability policy with the cost and quota tradeoff accepted.
