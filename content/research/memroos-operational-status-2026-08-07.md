---
title: "MemroOS operational alert and roadmap status"
description: "Evidence-backed status of recent connector and memory alerts, Beastmode Luna host repairs, and remaining live-gated work."
publishedAt: "2026-08-07"
tags: [memroos, operations, rca, beastmode, langsmith, connectors]
keywords: [agent-key, mem0, connector sync, memory isolation, Luna Max, LangGraph, LangSmith, deployment]
author: "Codex"
source_session: "019fdac3-ab4e-7a21-bbef-f37ee440470a"
model: "gpt-5.6-luna"
sources:
  - "label:circleback:19fcdf2b9a04caf4"
  - "label:circleback:19fcdf31a3306949"
  - "label:circleback:19fcdf2e6f6659a9"
  - "file:/home/lac5q/github/memroos-product/.planning/ROADMAP.md"
  - "file:/home/lac5q/github/memroos-product/docs/production-deployment.md"
derived_from:
  - "content/research/connector-space-isolation-rca-2026-08-07.md"
  - "content/research/nango-connection-ownership-rca-2026-08-07.md"
regen_prompt: "Recheck recent MemroOS alert emails, current branch/test/deploy evidence, and both Beastmode host preflights, then refresh the remaining-live-gates status without claiming unverified provider proof."
---

# Operational status

## Alert evidence

Circleback surfaced two unread Aug 4 reports from Eric Rosenthal:

- “Fwd: MemRoOS bug report — agent-key unset + mem0 write timeout (+ Cowork connector history)” (thread 19fcdf2b9a04caf4)
- “Fwd: MemRoOS connectivity test — results & two open issues” (thread 19fcdf31a3306949)

The connected email search exposed subjects and dates, but not the forwarded message bodies. Therefore the specific reported timeout payload is not treated as independently reproduced from email alone.

## Root cause work completed locally

The current codex/connector-isolation-main branch is clean at 2aced7af, two commits ahead of origin/main:

- 13f8aaba: connector memory is isolated by connection/tenant space.
- 2aced7af: connector sync health exposes scheduler/auth degradation and last-run state.

The base already includes Nango connection ownership enforcement, governed agent authentication, LangGraph-to-LangSmith trace substrate, and GSD closeout gates. Local validation previously passed typecheck, targeted connector/cron tests (62 tests), targeted lint, and the full fast suite (3,977 passed, 52 skipped).

## Beastmode/Luna host evidence

- maeve-u1: native Luna model preflight passed; local bm read-only smoke passed; Beastmode suite is 12/12 green.
- main-mac (the accessible likely alias for the requested but unresolved main-man): policy digest and Luna preflight passed; non-interactive PATH discovery was repaired; Pi better-sqlite3 was rebuilt from Node ABI 147 to the host ABI 137; the rerun returned expected project facts and BM_EXIT with no warning.
- main-man: not resolvable by DNS, hosts, SSH config, or Tailscale; no claim is made that it is identical to main-mac.

## Remaining live gates

1. Promote the two connector fixes through the governed branch/PR and production deploy. This requires explicit outbound authorization.
2. Prove live provider-backed connmem writes/recall for Eric and a second agent on Cordant; code and tests do not substitute for credentials and end-to-end evidence.
3. Verify Linear/Circleback/Notion onboarding, server indexing, and tenant/agent isolation on the deployed hosts.
4. Enable and prove LangGraph → LangSmith with production credentials and a trace visible in LangSmith.
5. Resolve roadmap phases that are explicitly credential/evidence gated (including deferred 175/176, live SLO evidence, production/admin smoke, and Phase 231/237 measured evaluation).
6. Deploy to Cordant-Hermes and oracle-1 only after the exact target, revision, environment, and verification commands are approved.

No production push, merge to the default branch, or deployment was performed in this review.


## Follow-up host check (2026-08-07)

The public verification script confirms onboarding reaches both hosts with the expected 403 responses. Live health then showed:

- Oracle: mem0 degraded with one queued memory save; connmem up.
- Cordant: mem0 up; connmem degraded because the service was absent from the running compose project.

Read-only SSH inspection confirmed the Cordant compose file defined connmem but the running stack had no connmem container. The app service did not declare connmem in depends_on, so the documented `up -d memroos` deployment left the connected-memory path silently omitted. The repository now declares connmem as a healthy dependency of memroos (commit `0b090028`); this requires the next governed deploy to rebuild/start the stack before the alert can be cleared. No remote service was restarted in this review.


## Follow-up Oracle memory alert RCA (2026-08-07)

Oracle logs show the queued Cowork memory write is not an agent-key or Qdrant failure. The Mem0 circuit breaker is open after repeated connection failures to Ollama; Qdrant is reachable. The host Ollama unit and host endpoint are healthy, and the host .env sets OLLAMA_BASE_URL to the Docker gateway (172.18.0.1). The running mem0 container ignored that value because docker-compose.local.yml hard-coded http://ollama:11434 even though the oracle cloud-profile stack has no compose ollama service. Commit d73f3c4d makes OLLAMA_BASE_URL environment-driven, preserving bundled Ollama defaults for local/Cordant installs. The queue will only clear after a governed rebuild/restart and a live replay check.


## Follow-up live evidence — Oracle queue schema

Read-only inspection on 2026-08-07 found Oracle's currently deployed `mem0` queue database has one pending request (`id=1`, `retry_count=0`) but lacks the `dead_letter_requests` table. The deployed queue worker therefore cannot complete its retry-to-dead-letter transition until the next application image is deployed with the queue schema initializer. This is consistent with the observed repeated `mem0-ollama circuit OPEN` replay errors. The local source already creates `dead_letter_requests` in `Mem0Queue._init_db`; the pending action is the authorized deployment of the current source, followed by queue replay and health verification. No queue data was deleted or altered.
