---
name: "gsd-roadmap-traction-audit-2026-08-08"
title: "GSD roadmap traction audit"
description: "Evidence-backed checkpoint for active GSD roadmap lanes, LangSmith configuration, production status, and external blockers."
publishedAt: "2026-08-08"
tags: [gsd, roadmap, operations, runtime-bottleneck, langsmith, production]
keywords: [Phase 175, Phase 176, Phase 203, Phase 237, Oracle, Cordant, LangGraph]
author: "Codex"
source_session: "019fdac3-558f-72f1-9ca4-ac23f294db7e"
model: "gpt-5.6"
sources:
  - "repo:.planning/ROADMAP.md"
  - "repo:.planning/STATE.md"
  - "repo:.planning/milestones/v8.39-observability-gated-memory-engine-ROADMAP.md"
  - "repo:.planning/decisions/runtime-bottleneck.json"
  - "repo:docs/production-deployment.md"
  - "repo:reports/operator-load/runtime-bottleneck/"
derived_from:
  - "content/operations/memroos-production-checkpoint-2026-08-08.md"
regen_prompt: "Re-audit the active GSD roadmap against repository evidence, current production probes, and secret-safe LangSmith configuration, then update the status matrix and blockers."
---

# GSD roadmap traction audit — 2026-08-08

## Outcome

The repository is on `main` at `47cde537` with a bounded Phase 175 evidence/guard change in progress. The roadmap now distinguishes implementation-complete lanes from external-evidence gates. No backend promotion or company-wide indexing claim is being made without provider receipts.

## Green or implementation-complete lanes

- Phase 175: two live Oracle 300-second operator waves (510 and 501 requests, zero request errors) and two persisted 25-task lexical controls. Decision is `optimize-current-stack`; public p95 is retained as an unknown boundary because per-request dependency timing is not emitted.
- Phases 185–190: connected-memory runtime seam, topology/auth gates, structural debt paydown, and client barrel split are on `main`; Phase 190 records unavailable bundle metrics rather than fabricating a reduction.
- Phases 201–205: invite/multi-harness and Cowork paths, Google OIDC code, ledger honesty, and Oracle point-and-index knowledge provisioning are implemented. Google OAuth client credentials and the live invite→Google smoke remain operator work.
- Phases 208–211 and 228–236: ownership/capability controls, onboarding rescue/reporting, LangSmith bridge, contained memory-engine work, observations, and living briefs have implementation evidence; Oracle/Cordant deployment and required-service probes are the current production baseline.

## Open evidence or operator gates

- Phase 176 Linear/Circleback: approved company-managed identities, capability discovery, live backfill, provider-total reconciliation, deletion/retention proof, and cross-source recall. Notion is a sibling connector gate.
- Phases 191–195: code and telemetry are deployed, but Cordant correctly reports `known_unwired` until real external sessions emit probe/capture receipts and the adoption SLO is measured.
- Phases 196–198: Phase 196 has local disposable-host proof; host deployment/verification, Cordant parity, population jobs, and measured storage decision remain. No SQLite→Postgres migration is authorized.
- Phase 213 and Phase 237: governance surfacing, licensed LoCoMo/LongMemEval/BEAM fixtures, equal-model Mem0/Hindsight/Recall measurements, provider-backed receipts, and promotion/rollback thresholds remain. Hindsight stays `EMULATE`.
- Phase 202/229 WORKAGENT-05: ChatGPT Workspace Admin custom-app creation, OAuth, tool scan, Workspace Agent Preview/Run, and explicit publish smoke.
- Phase 126–127 and main-man: blocked by external IdP/MDM and host access. Main-mac is not main-man.

## LangSmith configuration

The LangSmith credential was read through the Oracle 1Password service account item `lsng66ph6ynkm5dh676jn2cpaa` without exposing the secret. The key hash matched the production value. Maeve now has a mode-600 ignored `apps/memroos/.env.local` with the tracing flags, endpoint, project, workspace ID, metadata-only payload mode, and full sampling. Oracle and Cordant already carried the same configuration. The previous HTTP 403 was a diagnostic error from using a GET path; the application POST run endpoint accepts the key and workspace header (an empty payload reaches validation with HTTP 422). Restart local processes after changing env. Main-man still needs its own service-account/session projection if it is to be configured.

## Validation and provenance

The structural roadmap gates are green with zero active pre-spike steps and four approved deferred spikes. The local knowledge-index gate is informationally skipped because `/home/lac5q/github/knowledge` is absent on Maeve. Fable 5 high read-only validation passed for the Phase 175 fixes. The requested `gpt-5.6-luna` worker could not be spawned because this environment exposes only `gpt-5.6-sol` and `gpt-5.6-terra`; no Luna pass is claimed.
