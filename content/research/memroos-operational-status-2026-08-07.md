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


## Follow-up deployment and LangSmith live proof (2026-08-08 UTC)

The governed merge and production rollout are now complete for the current default branch:

- Local `main` is clean and tracks `origin/main` at merge commit `c22f93f3`.
- Oracle-1 and Cordant-Hermes are both on that exact revision; local production-only preservation/override files and predeploy backup refs were retained, and no volumes or queue data were deleted.
- Final remote `verify-onboarding-deploy.sh` and host-profile health checks passed on both hosts. Public `/api/health` returned 200 with mem0, Graph Memory, Agents, APO, and connmem up. RTK and QMD remain explicitly optional/degraded local tools.
- Onboarding checks on both public endpoints return the expected 403 for invalid/expired inputs, including the expected invalid-signature response.

### LangGraph → LangSmith

The orchestration image was rebuilt from the merged source on both hosts (the initial app-only rebuild had left an older orchestration image running). The LangSmith API key remains sourced from the host's secret manager and is not stored in this report. The organization-scoped key required the authorized workspace target, which is now configured on both hosts. Tracing remains metadata-only and fail-open.

A no-agent, approval-gated smoke route was run on each host and then rejected/cleaned up:

- Cordant trace `d558eeed-ede0-55e0-84a4-16678bfe3796`: LangSmith GET returned `status=success`, `name=memroos.langgraph.run`, `run_type=chain`.
- Oracle trace `61b76893-790b-5894-b3ce-3648dbea821e`: LangSmith GET returned the same success/name/type proof.
- Local trace receipts on both hosts have `export_status=queued`, `reason_code=null`, `remote_project=memroos`; the authoritative remote GET is the live export proof.
- Oracle's container DNS could not resolve the LangSmith endpoint through Docker's embedded resolver even though the host could. The production-only untracked override now bootstraps the orchestration container with the host VCN resolver before uvicorn; resolution and trace export are verified after recreation.
- All deployment-verifier smoke HIL decisions were rejected after validation; no pending deployment-verifier HIL entries remain.

### Remaining gates

Provider-backed connector writes/recall for named users, Linear/Circleback/Notion onboarding/indexing, live SLO/evaluation phases, and other explicitly credential/evidence-gated roadmap slices remain open. Optional RTK/QMD degradation is expected in these production profiles.


## Follow-up queue replay check (2026-08-08 UTC)

After the merged image rollout and the host-specific Ollama endpoint fix, the read-only Mem0 queue status is healthy on both production profiles: `queued=0`, `oldest=null`, and no recent replay failures. No queue rows were deleted by the verification.


## Connector onboarding recovery — 2026-08-07 continuation

- Cordant host was missing `NANGO_SECRET_KEY` despite the production contract requiring Oracle and Cordant to share the same Nango environment. The production Nango secret was streamed from the 1Password service account to Cordant's mode-600 `/home/ubuntu/memroos/.env`; it was never printed or committed. The app service was recreated with the profile-aware restart wrapper.
- Cordant now reports the Linear, Circleback, and Notion provider cards as Nango-available. The same check also confirms the Nango-backed Google providers remain available.
- A read-only inventory showed six historical Nango connections whose end-user ID exactly matched the existing `eric@cordant.ai` user. Only those exact matches were materialized through the existing authenticated OAuth callback; orphaned/test connections with no matching local owner were left untouched. The resulting local rows are private (`is_shared=0`, `needs_owner=0`) and owned by Eric; the authenticated connections endpoint returned all six as `connected`.
- The connector scheduler previously waited for its first 15-minute interval after startup. `startConnectorJob()` now performs one bounded, fail-open cycle immediately, then retains the 15-minute interval. Focused connector ownership/sync/callback tests pass (3 files, 10 tests).
- The Python CONNMEM runtime remains intentionally fail-closed and unconfigured on both hosts because no provider registry/credentials have been approved for that separate host-level adapter plane. Nango-backed app connectors are the active user-scoped path; no provider credential was invented or silently adopted.

## Remaining gate

- Run and capture a real provider sync/reconciliation receipt for the exact Cordant-owned Linear/Circleback/Notion connections, including fetched/unique/indexed/failed counts and representative recall. Historical Nango metadata alone is not proof of provider data coverage.
- Oracle still has no local user matching the historical Nango end-user IDs, so its orphaned connections remain intentionally unmaterialized until an owner completes a fresh OAuth flow or an explicit operator-approved identity mapping exists.

Sources: live host env/container inspection, Nango connection metadata (secret-safe), authenticated Cordant `/api/tools/connections` response, repository `sync-job.ts` and focused Vitest run.


## Continuation deploy and owner-scope verification — 2026-08-07

The owner-scoped connector sync hardening is merged on `main` as `052ae485320bf8acb8a162120e8d77d8fa0fc82b` and pushed. The stale connector branches were pruned; local `main` is clean and tracks `origin/main`.

Oracle-1 and cordant-hermes-01 were rebuilt with the profile-aware restart wrapper and both containers restarted at that exact commit. `scripts/verify-onboarding-deploy.sh` passed on each host: `/api/health` returned 200, required services were healthy, and invalid/structurally valid bad onboarding tokens returned 403 (not 401). Known host-only preservation/backup files remain untracked by design and were not deleted.

The Cordant owner route was exercised with a short-lived in-container admin JWT for the existing owner. It returned HTTP 200 with `written=200`, `duplicates=0`, `skipped=0`, and `degraded=false`. A sanitized read-only database check then found 3 private connector spaces containing 200 messages, all 3 with the owner member and zero other human members; 4 shared connector spaces contain 467 messages. Three owner-governance audit rows and nine connector sync-state rows are present. Provider content, credentials, and tokens were not recorded here.

The Cordant NOC adoption endpoint is live but truthfully reports `sourceState=known_unwired` / metric `unavailable`; no live adoption SLO is claimed. The code-side gates remain green: 474 test files / 3,988 tests passed with 52 skipped in the fast suite, typecheck and targeted lint passed, role-rank/lib-boundary/SQLite allowlist/GSD receipt gates passed, and the final compact Claude Opus 5 xhigh review returned PASS. Its non-blocking advisories are the same-process owner-sync lease, the fixed 30-second throttle window, and keeping the shared-shell backfill predicate explicit.

The roadmap/state docs now distinguish implemented code and production evidence from the remaining external gates: ChatGPT Workspace Admin custom-app/tool-scan/publish smoke, provider-backed Linear/Circleback/Notion reconciliation and recall, live adoption producers/SLO evidence, Phase 175/176 measurements, and Phase 237 external evaluation. No claim is made that those credential/evidence gates are closed.


## Provider aggregate after live owner sync — 2026-08-07

A sanitized Cordant database aggregate confirms the owner run materialized private rows by provider without exposing record content: Circleback 20, Google Drive 100, and Linear 80. Notion had one successful sync-state row but no new private rows in this run. Connector sync-state totals report Circleback 3 states/3 successful, Google Drive 2/2 successful, Linear 3 states/1 successful (the other states represent prior/degraded history), and Notion 1/1 successful. These counts are application-level evidence for the deployed owner path; they are not a claim of company-complete provider coverage.


## Remaining evidence probes — 2026-08-07

The Phase 175 runtime-bottleneck checker still fails closed because the required suite manifest, two operator runs, two retrieval runs, CPU/heap/traces, and attribution artifacts are absent. This is an evidence blocker, not a test regression. The future-spike checker remains green (6 reports and 4 fixture tests).


Roadmap reconciliation itself is committed and pushed as `e210714e05952d1379650809f5d243fb15a19b42`; both production checkouts were fast-forwarded to that commit without rebuilding unchanged containers.
