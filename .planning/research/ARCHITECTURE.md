# Architecture: v5.0 Memory Trust + Operational Intelligence

**Project:** Memroos
**Milestone:** v5.0
**Researched:** 2026-05-23
**Scope:** Integration of Memory Security, Source Reliability, NOC Real-Data, Harness Evidence, and Auth Hardening into the existing architecture

---

## Existing Architecture Baseline

Before describing what changes, the points of attachment that v5.0 touches:

| Component | Location | Role in v5.0 |
|-----------|----------|--------------|
| Main SQLite DB (`conversations.db`) | `apps/memroos/src/lib/db.ts` | Gains `raw_artifacts`, `security_labels`, `classification_reviews`, `cron_job_registry` tables |
| `db-schema.ts` `initSchema()` | Same file | All new DDL lands here as additive migrations |
| `audit_log` | Existing table | Gains `security_label` and `policy_decision` columns; every gate allow/deny/redact logged here |
| `/api/recall` | `app/api/recall/route.ts` | Wraps with retrieval policy gate before executing recall |
| `/api/memory/search`, `/api/memory/multi-search` | `app/api/memory/search/`, `multi-search/` | Same gate wrapping |
| `MemoryAdapter` interface | `lib/memory/adapter.ts` | Gate sits above adapters at route boundary — adapters remain ignorant of actor/policy |
| `scanContent()` | `lib/content-scanner.ts` | Becomes the first deterministic detector in the classification cascade |
| `authenticateUser()` | `lib/auth/session.ts` | Returns `SessionUser`; extended to `Actor` type that also covers agent API keys |
| `instrumentation.ts` + `tryAcquireSchedulerLock()` | `src/instrumentation.ts`, `lib/scheduler-singleton.ts` | Cron health jobs register via existing scheduler pattern; no new scheduler infrastructure |
| `/api/context/health` | `app/api/context/health/route.ts` | Model for cron health endpoint; same evaluate-from-registry pattern |
| `seal_evidence_bundles` table | `lib/seal/behavioral-schema.ts` | Generalized into universal `task_evidence_bundles` keyed on `a2a_tasks.task_id` |
| `orchestration.db` (Python, LangGraph) | `services/orchestration/` | Evidence bundles live in main DB; cross-DB link via `orchestration_thread_id` stored in `task_evidence_bundles` |
| OAuth/SSO | Not yet built | Issues same JWT as current password auth; `session.ts` + cookie/Bearer flow unchanged |
| Delegated agent access context | Policy gate + audit/evidence paths | Carries responsible user identity, OAuth delegation claims, and agent id/version down to data-element authorization |

---

## Question 1: Where Does the Raw Evidence Vault Live?

**Decision: Filesystem artifacts + metadata-only rows in main SQLite DB.**

Raw artifacts are NOT stored in SQLite as large blobs. The vault is a directory tree on disk:

```
~/.memroos/vault/
  {tenant_id}/
    {year}/{month}/{day}/
      {session_id}.ndjson.zst     # per-session compressed NDJSON
      {session_id}.ndjson.zst.sha # content hash for verification
```

The main SQLite DB holds a `raw_artifacts` table that is a metadata index only:

```sql
CREATE TABLE IF NOT EXISTS raw_artifacts (
  id              TEXT PRIMARY KEY,               -- UUID
  artifact_uri    TEXT NOT NULL UNIQUE,           -- filesystem path relative to vault root
  content_hash    TEXT NOT NULL,                  -- sha256 of compressed bytes
  source          TEXT NOT NULL,                  -- 'meeting'|'email'|'dm'|'file'|'agent_conv'
  actor_id        TEXT,                           -- user_id or agent_id that originated it
  tenant_id       TEXT NOT NULL DEFAULT 'default-tenant',
  project_id      TEXT,
  session_id      TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  artifact_date   TEXT NOT NULL,                  -- date of the content (not ingestion)
  compression     TEXT NOT NULL DEFAULT 'zstd',
  size_bytes      INTEGER,
  encryption_key_id TEXT,                         -- null = unencrypted; else key id in key store
  replay_state    TEXT NOT NULL DEFAULT 'pending' -- 'pending'|'indexed'|'archived'|'deleted'
);
```

Security labels are stored in a separate `artifact_labels` table that joins to `raw_artifacts` by `artifact_id`:

```sql
CREATE TABLE IF NOT EXISTS artifact_labels (
  artifact_id       TEXT NOT NULL REFERENCES raw_artifacts(id) ON DELETE CASCADE,
  visibility        TEXT NOT NULL DEFAULT 'private'
                    CHECK(visibility IN ('private','internal','public_safe','public_approved')),
  domain            TEXT,                -- 'legal'|'finance'|'hr'|'sales'|'client'|'personal'|'engineering'
  sensitivity       TEXT,               -- 'pii'|'secret'|'credential'|'privileged'|'contract'|'payment'|'health'
  policy            TEXT NOT NULL DEFAULT 'sealed'
                    CHECK(policy IN ('indexable','agent_visible','requires_redaction','requires_human_review','sealed')),
  classifier_version TEXT NOT NULL,
  confidence        REAL,
  reason_code       TEXT,
  evidence_spans_json TEXT,
  review_state      TEXT NOT NULL DEFAULT 'auto'
                    CHECK(review_state IN ('auto','pending_review','approved','rejected')),
  reviewed_by       TEXT,
  reviewed_at       TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (artifact_id)
);
```

The same label structure applies at the `messages` row level (inline columns, not a join table, for query performance):

```sql
-- Migration: add label columns to existing messages table
ALTER TABLE messages ADD COLUMN visibility  TEXT NOT NULL DEFAULT 'private';
ALTER TABLE messages ADD COLUMN sensitivity TEXT;
ALTER TABLE messages ADD COLUMN policy      TEXT NOT NULL DEFAULT 'sealed';
ALTER TABLE messages ADD COLUMN classifier_version TEXT;
```

**Why not SQLite blobs:** The spike explicitly rules out raw binary in SQLite as the long-term source of truth. Large blobs create WAL pressure, complicate retention/deletion, and resist compression. Filesystem artifacts support content-addressed dedup, archival, and encryption at the file layer.

**Backward compatibility:** Existing `messages` rows gain label columns with safe defaults (`visibility='private'`, `policy='sealed'`). No existing query breaks; they simply see all rows as private/sealed until reclassified.

---

## Question 2: How Does Classification Fit Into Existing Ingest Paths?

**Decision: Classification runs at ingest as a non-blocking cascade; policy is enforced at retrieval.**

The classification cascade is a new library: `lib/classification/`. It does not replace or move `scanContent()` — it composes with it.

### Cascade Layers (in order)

```
Source metadata gates
  └── content-scanner.ts (existing 18 patterns, severity tiers)
        └── New deterministic detectors:
            │   - source-path detector (gmail_label, slack_channel, drive_folder, mime_type)
            │   - sender-domain detector
            │   - calendar-attendees detector
            │   - secret/credential regex (extends existing patterns)
              └── LLM constrained adjudicator (only when deterministic gates abstain)
                    └── Human review queue (low confidence, legal/finance/HR/credential/public)
```

### Integration Points by Ingest Source

**SQLite conversation store (messages table):**
- Classification runs in `lib/db-ingest.ts` after the message is written.
- Label update is a second write to the `artifact_labels` table (or inline columns on `messages`).
- If the classifier needs human review, a `classification_reviews` row is inserted and the message `policy` stays `sealed`.
- Existing dedup logic (hash+mtime+origin) is unchanged; classification is additive.

**Meeting transcripts (Pipecat DailyTransport → messages):**
- Source path = `meeting`, source metadata includes meeting_id, attendees, consent_given.
- All meeting content defaults to `visibility='private'`, `domain='client'` unless a promotion is explicitly approved.
- Attendees are a deterministic signal: internal-only attendees vs external parties.

**Emails (Gmail/Spark ingest path):**
- Source path = `email`, metadata includes sender_domain, gmail_label, thread_id.
- `sender_domain` detector: internal domain → `visibility='internal'`; external → `visibility='private'`.
- `gmail_label` detector: labels matching `legal_*`, `finance_*`, `hr_*` set corresponding `domain`.
- Label-based classification is deterministic — no LLM call needed for these cases.

**New `classification_reviews` table:**

```sql
CREATE TABLE IF NOT EXISTS classification_reviews (
  id              TEXT PRIMARY KEY,
  artifact_id     TEXT REFERENCES raw_artifacts(id),
  message_id      INTEGER REFERENCES messages(id),
  review_type     TEXT NOT NULL,    -- 'low_confidence'|'conflicting_rules'|'public_promotion'|'legal'|'finance'|'hr'
  proposed_labels_json TEXT NOT NULL,
  evidence_spans_json  TEXT,
  policy_reason   TEXT,
  assigned_to     TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK(status IN ('pending','approved','rejected','escalated')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  resolved_at     TEXT
);
```

---

## Question 3: Where Does the Retrieval Authorization Gate Intercept?

**Decision: A single library `lib/memory/policy-gate.ts` wraps at the route boundary — NOT inside MemoryAdapter.**

The gate must NOT live inside adapters. MemoryAdapters are unaware of actor or purpose by design (MEM-06 enforces no client handle leakage; the same isolation principle applies to policy). A future adapter cannot accidentally bypass the gate if the gate is at the route layer.

### Actor Shape

Both human users and agents must be representable as an actor:

```typescript
// lib/memory/policy-gate.ts
export type ActorKind = 'user' | 'agent';

export interface Actor {
  kind: ActorKind;
  id: string;
  role: string;               // UserRole ('admin'|'operator'|'reviewer') or agent capability tier
  tenantId: string;
  projectId?: string;
  capabilities: string[];     // agent_capabilities rows or user capabilities derived from role
  purpose?: string;           // 'recall'|'context_pack'|'export'|'dispatch'|'index_write'
}
```

`authenticateUser()` in `session.ts` returns `SessionUser` — this is promoted to `Actor` with `kind='user'`. For agent API keys, `Actor` is constructed from `agent_api_keys` + `agent_capabilities` rows. Both flows go through the same gate.

### Interception Points

| Surface | File to Modify | Gate Behavior |
|---------|---------------|---------------|
| `/api/recall` | `app/api/recall/route.ts` | `policyGate(actor, purpose='recall', labels)` before result assembly |
| `/api/memory/search` | `app/api/memory/search/route.ts` | Gate on each result item (not the query) |
| `/api/memory/multi-search` | `app/api/memory/multi-search/route.ts` | Gate on each result item |
| Context pack assembly | `lib/dispatch/` or wherever context is assembled for agent dispatch | Gate before packing |
| `/api/chatgpt` (ChatGPT Actions) | `app/api/chatgpt/route.ts` | Gate on all memory-backed results |
| Derived index writes (FTS, Qdrant, Neo4j, qmd) | `lib/db-ingest.ts`, `lib/memory/*.ts` | Check `indexable=true` before writing; otherwise skip or write redacted projection |
| Export endpoints | Any `/api/*/export` route | Gate on export purpose |
| A2A dispatch context | `lib/a2a/` or `lib/dispatch/` | Gate on dispatch purpose before attaching memory context |

**Gate decision outcomes:** `allow | deny | redact | review_required`

Every decision is logged to `audit_log` with `actor_id`, `resource_type`, `resource_id`, `security_label_snapshot`, `purpose`, `decision`, and `reason_code`. This is the evidence for MEMSEC-08 negative fixtures.

### What Does NOT Change

- `MemoryAdapter` interface — no policy fields added
- `MemoryAdapter` registry — no policy registration
- Existing recall BM25/semantic/hybrid modes — gate wraps results, not the query execution
- Existing cross-project recall authorization (`allowed_project_ids` param) — remains as-is, gate is additive

---

## Question 4: How Do Evidence Bundles Integrate With A2A Task Tracking?

**Decision: Generalize `seal_evidence_bundles` into `task_evidence_bundles` keyed on `a2a_tasks.task_id`.**

The existing `seal_evidence_bundles` table (in `lib/seal/behavioral-schema.ts`) already has the right shape: `tool_call_transcript_json`, `verification_checks_json`, `unverified_assumptions_json`, `residual_risks_json`, `sources_consumed_json`, `replay_handle`, `rollback_handle`.

The universal evidence bundle is that schema promoted to apply to any task, not just SEAL eval jobs:

```sql
-- Phase 72 already has seal_evidence_bundles for SEAL jobs.
-- v5.0 adds task_evidence_bundles for all A2A tasks.
CREATE TABLE IF NOT EXISTS task_evidence_bundles (
  task_id                       TEXT PRIMARY KEY REFERENCES a2a_tasks(task_id) ON DELETE CASCADE,
  orchestration_thread_id       TEXT,    -- LangGraph thread_id in orchestration.db (cross-DB link)
  plan_json                     TEXT,    -- Plan phase: declared context, tools, permissions
  execution_transcript_json     TEXT NOT NULL DEFAULT '[]',  -- tool calls, results, hop sequence
  verification_checks_json      TEXT NOT NULL DEFAULT '[]',
  unverified_assumptions_json   TEXT NOT NULL DEFAULT '[]',
  residual_risks_json           TEXT NOT NULL DEFAULT '[]',
  sources_consumed_json         TEXT NOT NULL DEFAULT '[]',  -- artifact_ids, memory_ids, source labels
  memories_consumed_json        TEXT NOT NULL DEFAULT '[]',
  permissions_granted_json      TEXT NOT NULL DEFAULT '[]',
  replay_handle                 TEXT,
  rollback_handle               TEXT,
  created_at                    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at                    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
```

**Cross-DB boundary (main DB vs orchestration.db):**
- Evidence bundles live in main DB only.
- `orchestration_thread_id` is a string foreign key pointing at LangGraph checkpoints in `orchestration.db`.
- There is no cross-process join; callers who need both fetch the bundle from main DB and the checkpoint from orchestration DB independently.
- This is the same pattern as `a2a_tasks` (main DB) referencing LangGraph execution — the boundary is already established.

**SEAL evidence bundles remain.** `seal_evidence_bundles` is not replaced. It is purpose-specific for SEAL eval jobs with SEAL-specific fields (`pre_apply_baseline_w`, `post_apply_w`). `task_evidence_bundles` is the general-purpose sibling.

---

## Question 5: What New Telemetry Streams Does NOC Real-Data Require?

Most NOC panels (NOC-03 through NOC-09) can be wired from already-live API endpoints (see NOC note). The gap is NOC-10: efficiency signals require new telemetry streams that do not yet exist.

### New Telemetry Events (to be generated at runtime)

| Signal | Where Generated | New Table/Column |
|--------|----------------|-----------------|
| Retrieval call before useful work | After `/api/recall` or memory search returns; if no downstream dispatch follows within N seconds, log a `retrieval_without_action` event | `efficiency_events` table |
| Same-source re-read | In `lib/db-ingest.ts` or dispatch context assembly, track source_id reads within a task window | `efficiency_events` table |
| Raw-context ingest token share | In `/api/memory/add` or ingest path, record `token_count` and `ingest_type=raw_context|summary|agent_output` | Column on `agent_memory_writes` |
| Operator re-ask redundancy | When a HIL interrupt asks for info already in memory (detectable at HIL creation time) | Column on `orchestration_lineage` or event in `efficiency_events` |
| Rediscovered-fact rate | When mem0/Qdrant write produces a high-similarity hit to an existing memory | Returned by mem0 dedup logic; emit event |

**New `efficiency_events` table:**

```sql
CREATE TABLE IF NOT EXISTS efficiency_events (
  id              TEXT PRIMARY KEY,
  event_type      TEXT NOT NULL
                  CHECK(event_type IN (
                    'retrieval_without_action',
                    'source_re_read',
                    'operator_re_ask',
                    'fact_rediscovery'
                  )),
  task_id         TEXT,
  session_id      TEXT,
  actor_id        TEXT,
  source_id       TEXT,
  metadata_json   TEXT,
  occurred_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
```

### Unified NOC Endpoint

Rather than having each NOC panel make 6+ individual API calls, a unified endpoint aggregates the live sources:

**New:** `GET /api/operations/noc` — accepts `window` param (1h, 24h, 7d), returns per-panel provenance object:

```typescript
{
  pulse: { source: 'agents+hive+tokens', status: 'live', lastUpdated: '...', data: {...} },
  memory: { source: 'memory-stats+recall-stats', status: 'live', data: {...} },
  agentWorkload: { source: 'agents+orchestration', status: 'live', data: {...} },
  modelUtility: { source: 'model-routing+model-usage', status: 'live', data: {...} },
  efficiency: { status: 'missing_telemetry', requiredStreams: ['retrieval_without_action', ...] },
  governance: { source: 'audit-log+orchestration-hil+security', status: 'live', data: {...} },
  skills: { source: 'skills+seal-proposals', status: 'live', data: {...} },
  // ...
}
```

Each panel component consumes this via a single `useNocDashboard()` hook (React Query, polling every 30s).

### Cron Health Telemetry

New `cron_job_registry` table tracks each scheduled job's heartbeat and caught-up status:

```sql
CREATE TABLE IF NOT EXISTS cron_job_registry (
  job_id          TEXT PRIMARY KEY,      -- 'consolidation'|'decay'|'sla_escalation'|'embedding'
  display_name    TEXT NOT NULL,
  interval_ms     INTEGER NOT NULL,
  last_run_at     TEXT,
  last_success_at TEXT,
  last_error      TEXT,
  status          TEXT NOT NULL DEFAULT 'unknown'
                  CHECK(status IN ('healthy','warning','paused','stopped','unknown')),
  caught_up       INTEGER NOT NULL DEFAULT 0,  -- 1 = backlog cleared
  pause_reason    TEXT,
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
```

Each scheduler registered in `instrumentation.ts` writes to `cron_job_registry` on start, on tick success, and on error. The `startConsolidationScheduler`, `startSlaScheduler`, etc. each gain a `jobId` registration call. No new scheduler infrastructure is created — this is metadata-only observability layered onto the existing `tryAcquireSchedulerLock` + `instrumentation.ts` pattern.

New endpoint: `GET /api/cron/health` — same pattern as `/api/context/health`, returns per-job status from `cron_job_registry`. Pause/resume controls POST to `/api/cron/{jobId}/pause` and `/api/cron/{jobId}/resume`.

---

## Question 6: How Does OAuth/SSO Fit Into Existing JWT + RBAC?

**Decision: OAuth/SSO is an additional token-acquisition path; the session primitive is unchanged.**

The existing auth flow:
```
POST /api/auth/login → verifies password → signAccessToken() → JWT stored in HttpOnly cookie
  └── authenticateUser(req) reads JWT or Bearer → returns SessionUser
```

OAuth/SSO adds a parallel acquisition path:
```
GET /api/auth/oauth/{provider} → redirect to provider
  └── GET /api/auth/oauth/{provider}/callback → exchange code → create/lookup user row → signAccessToken() → same JWT
```

`signAccessToken()`, `verifyAccessToken()`, and `authenticateUser()` are unchanged. The OAuth callback creates a `users` row (or looks up by email) and then calls the existing `signAccessToken()`. From that point forward, session behavior is identical to password login.

**Role assignment for OAuth users:** OAuth-created users receive the `reviewer` role by default. An admin must promote to `operator` or `admin` via the existing user management UI. This prevents OAuth signup from bypassing role gates.

**Password reset:** A `password_reset_tokens` table stores time-limited tokens. `/api/auth/reset-password/request` emails a link; `/api/auth/reset-password/confirm` verifies the token and calls `hashPassword()`. The existing `password.ts` functions are reused.

**Backward compatibility:** All existing JWT tokens remain valid. All existing `authenticateUser()` call sites are unaffected. The only change to `session.ts` is accepting `oauth_provider` as an optional field on the `users` row.

---

## New vs Modified Components

### New Components

| Component | Type | Purpose |
|-----------|------|---------|
| `~/.memroos/vault/` | Filesystem | Append-only compressed artifact storage |
| `raw_artifacts` table | SQLite | Vault metadata index |
| `artifact_labels` table | SQLite | Security label dimensions per artifact |
| `classification_reviews` table | SQLite | Human review queue for classification conflicts |
| `task_evidence_bundles` table | SQLite | Universal evidence bundles for all A2A tasks |
| `efficiency_events` table | SQLite | New telemetry: retrieval-without-action, re-reads, etc. |
| `cron_job_registry` table | SQLite | Cron health heartbeat/status metadata |
| `lib/classification/` | TypeScript library | Cascade: deterministic detectors → LLM adjudicator → review queue |
| `lib/memory/policy-gate.ts` | TypeScript library | Single retrieval/use authorization gate |
| `GET /api/operations/noc` | Next.js API route | Unified NOC data contract with per-panel provenance |
| `GET /api/cron/health` | Next.js API route | Cron job registry health endpoint |
| `POST /api/cron/{jobId}/pause`, `/resume` | Next.js API routes | Cron job controls |
| `GET /api/auth/oauth/{provider}`, `/callback` | Next.js API routes | OAuth/SSO acquisition path |
| `POST /api/auth/reset-password/request`, `/confirm` | Next.js API routes | Password reset flow |
| `lib/vault/` | TypeScript library | Vault read/write/compress/encrypt helpers |
| `lib/encryption/` | TypeScript library | Envelope encryption, key management, rotation |

### Modified Components

| Component | Change | Backward Compatible |
|-----------|--------|-------------------|
| `lib/db-schema.ts` `initSchema()` | Add new tables, add label columns to messages/audit_log/hive_actions | Yes — additive migrations only |
| `lib/db-ingest.ts` | Run classification cascade after message write; call policy gate before FTS index writes | Yes — gate is additive; FTS skip for sealed content is safe |
| `app/api/recall/route.ts` | Wrap result assembly with policy gate | Yes — gate returns filtered results; existing callers see same shape |
| `app/api/memory/search/route.ts`, `multi-search/` | Same gate wrapping | Yes |
| `app/api/chatgpt/route.ts` | Gate on memory-backed results | Yes |
| `instrumentation.ts` | Register each scheduler with `cron_job_registry` on boot | Yes — additive |
| `lib/hil/sla-scheduler.ts`, `lib/memory-consolidation.ts`, etc. | Write heartbeat/success/error to `cron_job_registry` | Yes — additive writes |
| `lib/auth/session.ts` | Promote `SessionUser` to `Actor` type (superset); accept OAuth provider field | Yes — `SessionUser` remains valid |
| `lib/auth/types.ts` | Add `Actor` union type | Yes — new export only |
| `apps/memroos/src/components/operations/*.tsx` | Wire to `useNocDashboard()` hook; remove any remaining mock imports | Panels are already mock-free per Phase 73; wiring is additive |
| `app/api/memory/add/route.ts` | Run classification on new memories; label vector/graph writes | Yes — additive label pass |
| A2A dispatch path (`lib/a2a/`, `lib/dispatch/`) | Gate on dispatch context assembly; create `task_evidence_bundles` row | Yes — bundle creation is additive |

---

## Build Order With Dependency Justification

Dependencies flow strictly: classification schema must exist before the retrieval gate can check labels; the vault and labels must exist before safe-index projections can respect them; telemetry streams must exist before NOC panels can render them.

### Phase A: Raw Vault + Label Schema (prerequisite for everything)

1. `raw_artifacts` table DDL in `initSchema()`
2. `artifact_labels` table DDL
3. `classification_reviews` table DDL
4. Label columns added to `messages`, `audit_log`, `hive_actions`, `agent_memory_writes`, `recall_log` (additive ALTER TABLE migrations in `initSchema()`)
5. Vault filesystem helpers (`lib/vault/`) — path conventions, compression (zstd), write/read
6. No classification logic yet; all new rows default to `visibility='private'`, `policy='sealed'`

**Why first:** The label schema is the foundation that every subsequent component (gate, classifier, safe indexes) reads from. Running migrations before any logic is written ensures the schema exists in prod before any gate check.

### Phase B: Deterministic Detector Layer + Classification Cascade

1. `lib/classification/detectors.ts` — source-metadata, sender-domain, MIME, calendar, secret/credential detectors (extends `scanContent()`)
2. `lib/classification/adjudicator.ts` — constrained LLM adjudicator with strict JSON output, abstention, evidence spans
3. `lib/classification/cascade.ts` — chains detectors → adjudicator → review queue insert
4. Wire cascade into `lib/db-ingest.ts` (messages) and `app/api/memory/add` (mem0/vector writes)

**Depends on:** Phase A (label tables must exist to write to)

### Phase C: Retrieval Policy Gate

1. `lib/memory/policy-gate.ts` — Actor type, gate decision function, `audit_log` write
2. Wire into `/api/recall`, `/api/memory/search`, `/api/memory/multi-search`
3. Wire into ChatGPT Actions, export endpoints, context pack assembly, A2A dispatch

**Depends on:** Phase A (label columns on messages/artifacts must be readable); Phase B classification is NOT a hard dependency for the gate — gate can operate on default labels before classification runs, safely denying restricted content by default.

### Phase D: Safe Index Projections (Qdrant, Neo4j, FTS, qmd)

1. Add label check in `lib/db-ingest.ts` FTS writer: skip write if `policy != 'indexable'`
2. Add label check in mem0/Qdrant write path: skip or use redacted projection if not `indexable`
3. Add label check in Neo4j/graph write path: same pattern
4. Add label check in qmd ingest command generation

**Depends on:** Phase A (labels must exist), Phase C (gate proves security boundary; safe indexes are defense-in-depth on top)

### Phase E: Envelope Encryption

1. `lib/encryption/` — key generation, encrypt/decrypt helpers, key rotation API
2. Encryption applied to vault file writes (vault is already filesystem; encryption wraps the zstd artifact before write)
3. Encryption of sensitive JSON fields in `raw_artifacts` and `artifact_labels`

**Depends on:** Phase A (vault must exist). Does NOT block Phase C or D — encryption is defense-in-depth, not the primary security boundary.

### Phase F: Security Regression Tests (MEMSEC-08)

1. Negative fixture dataset: legal, finance, HR, credential, payment, privileged, personal, public-promotion samples
2. Tests prove each sample cannot appear in: recall results, memory search, context packs, ChatGPT Actions, exports, FTS, Qdrant query, Neo4j query, audit search
3. Tests are fail-closed: if gate is bypassed, tests fail

**Depends on:** Phases A-D (all gate and index surfaces must exist)

### Phase G: NOC Telemetry Streams + `/api/operations/noc`

1. `efficiency_events` table DDL (additive)
2. Emit `retrieval_without_action` events from recall/dispatch path
3. Emit `source_re_read` events from context assembly
4. `token_count` + `ingest_type` column on `agent_memory_writes`
5. `GET /api/operations/noc` endpoint aggregating live API sources with per-panel provenance
6. Wire `components/operations/*.tsx` panels to `useNocDashboard()` hook

**Depends on:** Nothing in the security chain; this is a parallel track. Telemetry streams must exist before the efficiency panels can render — emit streams (steps 1-4) before building panel UI (steps 5-6).

### Phase H: Cron Health Registry

1. `cron_job_registry` table DDL (additive)
2. Registration calls in each scheduler started from `instrumentation.ts`
3. `GET /api/cron/health` endpoint
4. `POST /api/cron/{jobId}/pause`, `/resume` endpoints
5. Schedules and routines console UI

**Depends on:** Nothing in the security chain. Parallel with Phase G. Uses existing `tryAcquireSchedulerLock` pattern — no new scheduler infrastructure.

### Phase I: Universal Evidence Bundles

1. `task_evidence_bundles` table DDL (additive to main DB)
2. Bundle creation at A2A task dispatch (write empty bundle at task creation, append during execution)
3. Bundle retrieval surface: `GET /api/a2a/tasks/{taskId}/evidence`
4. Harness Control Plane UI: Plan-Execute-Verify timeline panel

**Depends on:** Phase A (sources_consumed_json should reference artifact_ids from raw_artifacts). Can be built before full classification is complete; bundles record whatever label state exists at execution time.

### Phase J: Auth Hardening (OAuth/SSO, Password Reset, Role-Aware Nav)

1. `password_reset_tokens` table DDL (additive)
2. `oauth_provider` + `oauth_provider_id` columns on `users` table (additive)
3. Password reset request/confirm endpoints
4. OAuth provider routes and callback handlers
5. Email invitation delivery (extends existing `/api/auth/invite`)
6. Role-aware navigation gating (UI changes, no API changes)
7. API-key rotation UI

**Depends on:** Nothing in the security or telemetry chain. Fully parallel. The only constraint is that OAuth must issue the same JWT as password auth — which is guaranteed by reusing `signAccessToken()` unchanged.

---

## Dependency Graph Summary

```
Phase A (vault + label schema)
  ├── Phase B (classification cascade) → depends on A
  ├── Phase C (retrieval gate)         → depends on A (not B — gate works on defaults)
  │     └── Phase D (safe indexes)    → depends on A + C
  │           └── Phase F (regression tests) → depends on A + C + D
  └── Phase E (encryption)            → depends on A only
      
Phase G (NOC telemetry)               → independent of A-F
Phase H (cron health)                 → independent of A-G
Phase I (evidence bundles)            → soft depends on A (for artifact_ids in bundles)
Phase J (auth hardening)              → independent of all
```

**Critical path:** A → B → C → D → F (security chain). All other phases are parallel.

---

## Anti-Patterns Explicitly Rejected

### Do Not Put the Gate Inside MemoryAdapter
Adapters are stateless, actor-unaware search/write/health abstractions. A gate inside an adapter would be bypassable by registering a new adapter without the gate, and would duplicate actor resolution on every adapter. The gate lives at the route boundary and wraps all adapter calls.

### Do Not Store Raw Artifacts in SQLite as Source of Truth
Large blobs in SQLite create WAL pressure, resist content-addressed dedup, complicate retention/archival, and cannot be efficiently encrypted at the file layer. SQLite holds metadata only; the vault directory holds content.

### Do Not Build a New Scheduler for Cron Health
`instrumentation.ts` + `tryAcquireSchedulerLock()` is the established pattern. Cron health is a metadata-only observability layer (heartbeat writes + a status table) on top of existing scheduled functions. No new setInterval infrastructure.

### Do Not Build OAuth as a Separate Auth System
OAuth is an acquisition-path shim that terminates at `signAccessToken()`. The session primitive, cookie mechanics, JWT format, `authenticateUser()`, and all RBAC role checks are unchanged. OAuth users get the same JWT, same role gates, same audit actor identity as password users.

### Do Not Let Agent Identity Replace User Responsibility
Agent identity is an execution identity, not an authorization owner. Every agent-mediated data access must carry the responsible user identity and OAuth delegation context into the same policy decision as the agent id/version. The data element should see `on_behalf_of_user_id`, tenant/project, user role, OAuth provider subject, approved scopes/consent, and an encrypted credential reference or token handle. Raw OAuth bearer tokens must not be persisted in memory, audit, prompts, indexes, or agent-visible payloads.

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|-----------|-------|
| Schema changes | HIGH | Read actual db-schema.ts, seal/behavioral-schema.ts, existing table structures |
| Gate integration points | HIGH | Read actual route files, adapter interface, auth session.ts |
| Vault storage pattern | HIGH | Directly specified in memory-security-storage-spike.md |
| Classification cascade structure | HIGH | Directly specified in privacy-classification-policy-spike.md |
| NOC telemetry gaps | HIGH | Read noc-mock-data note + existing API list |
| OAuth integration | HIGH | Read existing jwt.ts, session.ts, auth types |
| Evidence bundle generalization | HIGH | Read seal/behavioral-schema.ts directly |
| Cross-DB orchestration.db boundary | HIGH | Confirmed in PROJECT.md and ROADMAP.md Phase 36 |
| Cron health pattern | HIGH | Read instrumentation.ts and scheduler-singleton.ts |

---

## Sources

- `.planning/notes/memory-security-storage-spike.md` (raw vault, two-gateway security model, label dimensions, encryption decision)
- `.planning/notes/privacy-classification-policy-spike.md` (classification cascade, deterministic gates first, LLM as constrained adjudicator)
- `.planning/notes/operations-noc-real-data-requirements.md` (live data already available, missing telemetry streams)
- `.planning/PROJECT.md` (v5.0 requirements MEMSEC-01..08, NOC-01..14, AUTH-FOLLOWUP-01..03)
- `.planning/REQUIREMENTS.md` (full requirement text for all v5.0 targets)
- `apps/memroos/src/lib/db-schema.ts` (existing schema: messages, audit_log, a2a_tasks, seal_evidence_bundles, users, skill_registry)
- `apps/memroos/src/lib/seal/behavioral-schema.ts` (seal_evidence_bundles structure — model for task_evidence_bundles)
- `apps/memroos/src/lib/memory/adapter.ts` (MemoryAdapter interface — gate must sit above this)
- `apps/memroos/src/lib/auth/session.ts`, `jwt.ts`, `types.ts` (existing JWT + RBAC pattern)
- `apps/memroos/src/instrumentation.ts`, `lib/scheduler-singleton.ts` (existing scheduler pattern to preserve)
- `apps/memroos/src/app/api/context/health/route.ts` (existing source health pattern to replicate for cron health)
- `apps/memroos/src/app/api/recall/route.ts` (existing recall route — primary gate interception point)
