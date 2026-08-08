---
name: "gsd-roadmap-traction-audit-2026-08-08"
title: "GSD roadmap traction audit"
description: "Evidence-backed checkpoint for active GSD roadmap lanes, LangSmith configuration, production status, and external blockers."
publishedAt: "2026-08-08"
tags: [gsd, roadmap, operations, runtime-bottleneck, langsmith, production]
keywords: [Phase 175, Phase 176, Phase 203, Phase 230, Phase 237, Oracle, Cordant, LangGraph]
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
  - "https://docs.langchain.com/langsmith/trace-with-api"
  - "https://docs.langchain.com/langsmith/manage-organization-by-api"
derived_from:
  - "content/operations/memroos-production-checkpoint-2026-08-08.md"
regen_prompt: "Re-audit the active GSD roadmap against repository evidence, current production probes, and secret-safe LangSmith configuration, then update the status matrix and blockers."
---

# GSD roadmap traction audit — 2026-08-08

## Outcome

The repository is clean on `main` at `a33c4e26`, and the current roadmap distinguishes implementation-complete lanes from external-evidence gates. Oracle and Cordant were rebuilt/restarted from that revision; onboarding, health, and required-service probes passed on both hosts. No backend promotion or company-wide indexing claim is being made without provider receipts.

## Green or implementation-complete lanes

- Phase 175: two live Oracle 300-second operator waves (510 and 501 requests, zero request errors) and two persisted 25-task lexical controls. Decision is `optimize-current-stack`; public p95 is retained as an unknown boundary because per-request dependency timing is not emitted.
- Phases 185–190: connected-memory runtime seam, topology/auth gates, structural debt paydown, and client barrel split are on `main); Phase 190 records unavailable bundle metrics rather than fabricating a reduction.
- Phases 201–205: invite/multi-harness and Cowork paths, Google OIDC code, ledger honesty, and Oracle point-and-index knowledge provisioning are implemented. Google OAuth client credentials and the live invite→Google smoke remain operator work.
- Phases 208–211 and 228–236: ownership/capability controls, onboarding rescue/reporting, LangSmith bridge, contained memory-engine work, observations, and living briefs have implementation evidence and are deployed on both production hosts.
- Production validation: full fast suite 478 files / 4,006 passed / 54 skipped; focused NOC 34/34; evidence tests 20/20; typecheck and lint (0 errors); GitNexus LOW-risk change detection; secret-guard checks; and Fable 5 high read-only validation passed.

## Open evidence or operator gates

- Phase 176 Linear/Circleback: approved company-managed identities, capability discovery, live backfill, provider-total reconciliation, deletion/retention proof, and cross-source recall. Notion is a sibling connector gate.
- Phases 191–195: code and telemetry are deployed, but Cordant correctly reports `known_unwired` until real external sessions emit probe/capture receipts and the adoption SLO is measured.
- Phases 196–198: Phase 196 has local disposable-host proof; host deployment/verification, Cordant parity, population jobs, and measured storage decision remain. No SQLite→Postgres migration is authorized.
- Phase 203 / 229 WORKAGENT-05: Google OAuth client setup and ChatGPT Workspace Admin custom-app creation, OAuth, tool scan, Workspace Agent Preview/Run, and explicit publish smoke.
- Phase 213 and Phase 237: governance surfacing, licensed LoCoMo/LongMemEval/BEAM fixtures, equal-model Mem0/Hindsight/Recall measurements, provider-backed receipts, and promotion/rollback thresholds remain. Hindsight stays `EMULATE`.
- Phase 126–127 and main-man: blocked by external IdP/MDM and host access. Main-mac is not main-man.
- Voyage / Phase 166 remains explicitly excluded by the standing quality gate.

## LangSmith configuration and live auth

The LangSmith credential was read through the Oracle 1Password service account item `lsng66ph6ynkm5dh676jn2cpaa` without exposing the secret. The configured tracing flags, endpoint, project, workspace ID, metadata-only payload mode, and sampling are present in Maeve's mode-600 ignored `apps/memroos/.env.local` and on both production hosts.

The earlier HTTP 403 was a diagnostic error from using a non-ingest GET path. The corrected probes now show control-plane access is valid: `/info`, `/workspaces`, `/api/v1/orgs/current`, and `/api/v1/orgs/current/roles` return 200 with the service key and workspace header. The actual data-plane probe `POST /api/v1/runs` returns `401 Unauthorized` even with the workspace and organization headers. An in-place least-privilege role update to the existing service key was rejected with `403 organization:manage required`; no privilege was broadened.

This is an external LangSmith RBAC/provisioning gate, not a repository or environment-variable failure. A LangSmith organization admin must either (a) assign the existing service key a workspace-scoped trace-writer/editor role with `runs:create` and `feedback:create`, or (b) issue a new workspace-scoped service key with that role, replace the secret in the AgentWritable item, and restart the two production app containers. Re-run the safe `POST /api/v1/runs` probe and verify a LangSmith receipt before marking Phase 230 live-green. The exporter remains fail-open, so this does not block MemroOS work.

## Validation and provenance

The structural roadmap gates are green with zero active pre-spike steps and four approved deferred spikes. The local knowledge-index gate is informationally skipped because `/home/lac5q/github/knowledge` is absent on Maeve. Fable 5 high read-only validation passed for the Phase 175 fixes. The requested `gpt-5.6-luna` worker could not be spawned because this environment exposes only `gpt-5.6-sol` and `gpt-5.6-terra`; no Luna pass is claimed. Prior Opus CLI attempts timed out.
