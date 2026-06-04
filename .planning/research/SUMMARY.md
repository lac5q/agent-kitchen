# Research Summary: v5.0 Memory Trust + Operational Intelligence

**Project:** Memroos
**Domain:** AI agent hub — memory security vault, fail-closed classification, retrieval authorization, operational observability, harness evidence, auth hardening
**Researched:** 2026-05-23
**Confidence:** HIGH

---

## Executive Summary

Memroos v5.0 is a security and observability hardening milestone for a production A2A agent hub. The system already has RBAC (v3.0), an 18-pattern content scanner (v1.5), HIL orchestration (v4.0), and a three-tier memory architecture (SQLite + Qdrant + Neo4j). The research consensus is that v5.0 must close three critical gaps before expanding agent autonomy: (1) sensitive organizational memory (legal, finance, HR, credentials) has no ingestion classification gate and no retrieval authorization boundary; (2) the NOC operations console is wired to mock data in production, eroding operator trust; and (3) the auth layer is missing email delivery, password reset, and OAuth/SSO — the table-stakes floor for any multi-user or team deployment.

The recommended approach is a strict build order enforced by hard dependencies: the security label schema must be designed and migrated first because every subsequent component — the retrieval gate, safe indexes, envelope encryption, evidence bundle provenance, and security regression tests — reads from it. The classification cascade uses a deterministic-first design (existing 18-pattern scanner + new NER/metadata detectors + Presidio Python service) before invoking the LLM adjudicator only on low-confidence cases. All encryption uses Node.js and Python standard-library primitives — no new crypto npm packages. Auth hardening is fully parallelizable with the security chain. As a core agent-security philosophy, user access must follow every agent-mediated data access: the control layer evaluates agent identity and responsible user identity together, with OAuth subject/scope/consent pushed into data-element authorization as normalized claims or encrypted credential references rather than raw bearer tokens.

The top risks: (1) Backfill blindness — existing FTS5/Qdrant/Neo4j content bypasses the new retrieval gate unless a reclassification sweep completes and MEMSEC-08 negative tests pass before the gate is declared live. (2) Embedding before classification — the 5-minute background embedding job will vector-index restricted content unless a provisional `private` label blocks the embedding path at write time. (3) The mem0 HTTP write path is ungoverned by the TypeScript ingestion layer, requiring retrieve-time classification as a compensating control.

---

## Stack Additions (Net-New Only)

No new database, no new scheduler, no Redis, no Socket.io.

**New npm dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| `arctic` | `^3.7.0` | OAuth 2.0 PKCE clients (Google, GitHub, Microsoft) |
| `resend` | `^6.12.3` | Transactional email — cloud-https profile |
| `nodemailer` | `^8.0.8` | SMTP email fallback — single-host profile |
| `@react-email/components` | `^1.0.12` | React email templates |
| `react-email` | `^6.3.2` | Dev preview server (devDep) |
| `@types/nodemailer` | `^6` | TypeScript types (devDep) |

**New Python dependencies (memory service):**

| Package | Version | Purpose |
|---------|---------|---------|
| `presidio-analyzer` | `>=2.2.362,<3.0` | PII/NER detection — Layer 2 of classification cascade |
| `presidio-anonymizer` | `>=2.2.362,<3.0` | Redaction output |
| `spacy` | `>=3.7,<4.0` | NER model backing Presidio |
| `zstandard` | `>=0.25,<1.0` | Zstd compression for vault writer |

**Pin tightening:** `cryptography>=46,<47` in memory service.

**spaCy model install** (Dockerfile/startup): `python -m spacy download en_core_web_lg`

**Zero new npm packages for:** encryption (Node 26 `crypto.subtle` AES-GCM + AES-KW), compression (`node:zlib` zstd), SSE telemetry, cron health, evidence bundles, NOC wiring.

---

## Feature Table Stakes

**Must ship:**

- Fail-closed ingestion classification: private-by-default, deterministic-first cascade, human review queue with SLA + drain path
- Retrieval authorization gate on every recall, memory search, context pack, ChatGPT Action, export, and A2A dispatch path
- Envelope encryption for raw vault artifacts (AES-GCM + AES-KW, key rotation, retired-key retention for replay)
- MEMSEC-08 negative tests proving restricted fixtures cannot surface through any retrieval path
- Classification-aware safe indexes — restricted content excluded from FTS5, Qdrant, Neo4j, qmd
- All 14 NOC panels backed by live data with per-panel `{source, lastUpdated, window, status}` provenance; no mock-data imports in production
- Cron job heartbeat + caught-up monitoring with pause/resume controls and declarative job registry
- Password reset via email + email invitations + OAuth/SSO (Google, GitHub)

**Should ship (differentiators):**

- Two-gateway model: ingestion classification AND retrieval authorization
- Redacted projections with vault provenance — not binary allow/deny
- User-delegated agent access: every agent access carries responsible user identity, OAuth subject/scope/consent, and agent id/version into data-element authorization
- Efficiency telemetry signals (retrieval-without-action, source re-read, operator re-ask redundancy, rediscovered-fact rate)
- Universal evidence bundles on all A2A tasks (Plan-Execute-Verify timeline, sources, memories, tools, replay handle)
- Schedules Console showing all recurring jobs with health and controls

**Defer to v5.1+:**

- Memory search surface (UX-FOLLOWUP-02) — wait for retrieval gate to stabilize
- TOTP/FIDO2 MFA — SSO covers immediate auth risk floor
- Cloud KMS adapter (AWS, GCP) — LocalFileKeyProvider sufficient
- Enterprise SAML/WorkOS

---

## Architecture Decisions

**Retrieval authorization gate:** Single `lib/memory/policy-gate.ts` library intercepting at route boundary above all MemoryAdapters. Adapters remain actor-unaware. Every gate decision logged to `audit_log`.

**Raw vault:** Filesystem directory (`~/.memroos/vault/<tenant>/<YYYY>/<MM>/<DD>/`) with SQLite metadata index only — no blobs in SQLite. Label schema on both `raw_artifacts` and `messages` via additive ALTER TABLE with safe defaults.

**Classification cascade:** Composes with existing `content-scanner.ts` as the first sub-stage → Presidio NER (Python FastAPI endpoint) → constrained LLM adjudicator only on low-confidence cases.

**OAuth/SSO:** Acquisition-path shim terminating at existing `signAccessToken()`. JWT format, session cookies, RBAC roles unchanged. Email-as-merge-key binds OAuth provider to existing user.

**Delegated user access:** Agent identity is never sufficient for data access. Every agent-mediated context-pack, retrieval, handoff, and memory-save operation carries `on_behalf_of_user_id`, tenant/project, user role, OAuth provider subject, approved scopes/consent, encrypted credential reference or token handle, and agent id/version into the policy gate. The data element is controlled by evaluating user and agent together. Raw OAuth bearer tokens are not stored in memory rows, audit rows, prompts, indexes, or agent-readable payloads.

**Universal evidence bundles:** New `task_evidence_bundles` table keyed on `a2a_tasks.task_id`. SEAL-specific bundles remain a sibling.

**New SQLite tables:** `raw_artifacts`, `artifact_labels`, `classification_reviews`, `task_evidence_bundles`, `efficiency_events`, `cron_job_registry`, `password_reset_tokens`.

**Modified tables:** `messages`, `audit_log`, `hive_actions`, `agent_memory_writes`, `recall_log` gain label columns via additive migrations.

---

## Critical Build Order

```
Phase 74: Security Label Schema + Raw Vault       MEMSEC-01, MEMSEC-02
  └─ Phase 75: Classification Cascade             MEMSEC-03, CTX-FOLLOWUP-03
  └─ Phase 76: Retrieval Authorization Gate       MEMSEC-04
       └─ Phase 77: Safe Indexes + Encryption     MEMSEC-05..07
            └─ Phase 78: Security Regression      MEMSEC-08

Phase 79: NOC Telemetry + Real-Data              NOC-01..14, OPS-AUDIT-01..04    (parallel)
Phase 80: Cron Health + Schedules Console        CTX-FOLLOWUP-01..02, CRON-HEALTH-01..05, UX-FOLLOWUP-03  (parallel)
Phase 81: Evidence Bundles + Harness Control     Harness reqs  (soft depends Phase 74)
Phase 82: Auth Hardening                         AUTH-FOLLOWUP-01..03  (fully parallel)
```

**Critical path:** 74 → 75 → 76 → 77 → 78. All other phases are parallel.

---

## Watch Out For

1. **Backfill blindness (highest severity):** Existing FTS5/Qdrant/Neo4j content bypasses the new gate. Prevention: full reclassification sweep before gate enforces; MEMSEC-08 tests as enforcement gate.

2. **Embedding before classification:** Background embedding job will vector-index restricted content if no provisional label blocks it. Prevention: stamp `private` at write time; add label check in embedding job to skip `policy=sealed`.

3. **mem0 HTTP bypass:** Agent writes via mem0 HTTP API skip the TypeScript ingestion gate. Prevention: classify at retrieval for `agent_memory` content; document and test the gap.

4. **Detector sprawl:** Old scanner and new detectors creating coverage gaps. Prevention: old scanner is the first sub-stage of a unified `DetectorPipeline`.

5. **OAuth middleware wrapping machine-facing routes:** A2A API key auth, MCP gateway, Python proxy break silently with global OAuth middleware. Prevention: composable `withOAuth` vs. `withApiKey` middleware chains.

---

## Research Flags

**Needs planning spike before phase starts:**

- **Phase 75:** Presidio `en_core_web_lg` model startup latency. If > 2s, async classification strategy becomes mandatory. 30-minute timing spike resolves.
- **Phase 81:** Shared harness state conflict detection semantics. Novel architecture. Brief design spec before coding.

**Standard patterns (no research needed):** Phases 74, 76, 77, 78, 79, 80, 82.

---

## Open Questions

- **KEK provider default** — LocalFileKeyProvider at `~/.memroos/vault.key` (follows `MEMROOS_SCHEDULER_LOCK` convention)
- **mem0 HTTP bypass scope** — audit all A2A task types for direct mem0 writes before Phase 76 gate goes live
- **Classification review queue SLA values** — suggested: meeting transcripts 48h, credentials 4h; not finalized
- **Evidence bundle scope** — define whether external A2A tasks, Paperclip fleet tasks, and voice sessions are included in Phase 81
- **OAuth delegation pushdown shape** — decide the canonical representation for data-element policy: encrypted token handle vs provider credential reference vs normalized claim set, with no raw bearer-token persistence

---

## Sources

| Source | Confidence |
|--------|------------|
| `.planning/notes/memory-security-storage-spike.md` | HIGH |
| `.planning/notes/privacy-classification-policy-spike.md` | HIGH |
| `.planning/REQUIREMENTS.md` | HIGH |
| `apps/memroos/src/lib/db-schema.ts` (direct read) | HIGH |
| `apps/memroos/src/lib/seal/behavioral-schema.ts` (direct read) | HIGH |
| `apps/memroos/src/lib/memory/adapter.ts` (direct read) | HIGH |
| `apps/memroos/src/lib/auth/session.ts`, `jwt.ts` (direct read) | HIGH |
| `apps/memroos/src/instrumentation.ts` (direct read) | HIGH |
| npm: arctic 3.7.0, resend 6.12.3, nodemailer 8.0.8 | MEDIUM |
| PyPI: presidio-analyzer 2.2.362, zstandard 0.25.0 | MEDIUM |
| Node.js v26 docs: `node:zlib` zstd stability-2 | MEDIUM |

*Research completed: 2026-05-23 | Ready for roadmap: yes*
