---
name: memroos-main-mac-alert-routing-rca-2026-08-09
title: "MemroOS Main-Mac alert routing and Cordant Google OAuth RCA"
description: "Root-cause and containment record for Cordant Google OAuth configuration and unwanted Main-Mac healthcheck emails."
publishedAt: "2026-08-09"
tags: [memroos, rca, oauth, alerts, main-mac, cordant]
keywords: [Google OAuth, Cordant, SendGrid, healthcheck, Gmail ingestion, QMD]
author: "Codex"
source_session: "019fdac3-ab4e-7a21-bbef-f37ee440470a"
model: "gpt-5.6"
sources:
  - "label:SendGrid Email Activity read-only query (2026-08-09)"
  - "label:Main-Mac launchd and memory healthcheck configuration (2026-08-09)"
  - "label:Cordant public Google status and OAuth redirect verification (2026-08-09)"
derived_from:
  - "content/research/memroos-connector-oauth-failure-rca-2026-08-08.md"
  - "content/research/memroos-remote-mcp-verifier-rca-2026-08-08.md"
regen_prompt: "Re-run the public OAuth checks, inspect Main-Mac launchd/env/logs, and query redacted SendGrid activity to refresh the RCA without exposing credentials."
---

## RCA

### Cordant Google OAuth

Cordant was missing all three Google OIDC runtime variables while Oracle already had the operator-console Web OAuth client. The existing client values were retrieved from the AgentWritable 1Password item without exposing them, installed into Cordant's runtime environment, and the MemroOS app was recreated. The required public callback is:

`https://memroos-cordant.epiloguecapital.com/api/auth/google/callback`

Verification now returns `{"configured":true,"reason":null}`. The OAuth start route returns a Google redirect carrying that exact callback, and Cordant's required core services remain healthy. A signed-in browser is still needed for the final invite-to-Google-to-session assertion; the Codex browser panel can open the route but cannot complete a user's Google consent interaction.

### Alert recipient and root cause

Redacted SendGrid activity showed the recurring messages were Main-Mac healthcheck notifications with the sender `alerts@memroos.com` and recipient `luis@epiloguecapital.com`. The MemroOS repository and host configuration do not directly address `luis.calderon@cordant.ai`; that address is therefore consistent with an alias or forwarding rule outside the MemroOS sender path. The Main-Mac launchd job `com.memroos.memory-healthcheck` runs the local `services/memory/healthcheck.sh` every five minutes and was the active sender.

The Main-Mac healthcheck environment had a SendGrid key and the legacy `luis@epiloguecapital.com` destination. The key is now disabled in the live Main-Mac environment, with a dated backup retained, and the destination is staged as `luis.calderon@gmail.com` for a future deliberate re-enable. Healthcheck output remains local, so failures are not silently discarded.

### Remaining operational defects

The local log still reports stale Gmail context ingestion because `gwsa` has no configured Google Workspace CLI OAuth client and refuses to select the Gmail account without the required identity scopes. It also reports two missing QMD index artifacts. These are logged operational follow-ups, not an email delivery failure. Repairing Gmail ingestion requires an operator to configure a Workspace CLI OAuth client and complete an interactive re-authentication; no credential was generated or stored by this investigation.

## Verification

- Cordant `/api/auth/google/status`: configured true, reason null.
- Cordant `/api/health`: core MemroOS, graph, agents, APO, and connmem services up; optional local RTK/QMD tools degraded as expected.
- Main-Mac env: SendGrid sink disabled; future alert target is the personal Gmail address.
- Roadmap and state files record the live status and remaining browser/Workspace CLI gates.


### Production notification boundary

Oracle and Cordant host profiles still retain `ALERT_EMAIL=luis@epiloguecapital.com` and their production SendGrid healthcheck sinks remain enabled so a real production outage is not silently suppressed. SendGrid activity showed the last MemroOS production failure messages were historical Oracle entries; no new MemroOS message appeared after the Main-Mac sink was disabled. The legacy production destination was intentionally not redirected without a confirmed canonical recipient, because changing it would be an external notification policy change.
