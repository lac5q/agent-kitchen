# Feature Landscape: Memroos v5.0 Memory Trust + Operational Intelligence

**Domain:** AI agent hub — memory security, operational observability, harness control plane
**Researched:** 2026-05-23
**Mode:** Subsequent milestone — new capabilities only (v4.0 and earlier excluded)

---

## Build Order and Hard Dependencies

The quality gate requires these dependencies be explicit before feature detail:

```
MEMSEC-02 (label schema design)
  └── blocks MEMSEC-01 (raw vault — needs labels at write time)
  └── blocks MEMSEC-03 (ingestion classification — classifies into label schema)
  └── blocks MEMSEC-04 (retrieval gate — enforces label policy)
  └── blocks MEMSEC-05 (safe indexes — filters by indexable label)
  └── blocks MEMSEC-06 (multimodal — embeddings inherit source label)
  └── blocks MEMSEC-07 (encryption — key id stored alongside label metadata)
  └── blocks MEMSEC-08 (regression tests — tests reference label values)

MEMSEC-01..08 (Memory Security Foundation)
  └── blocks any recall expansion (UX-FOLLOWUP-02 memory search surface)
  └── enables Harness Control Plane evidence bundles (bundles need vault provenance)

AUTH-FOLLOWUP-01..03 (Auth Hardening)
  └── must ship before introducing new roles or role-specific surfaces
  └── parallelizable with MEMSEC but must complete before new role claims are made in NOC

CTX-FOLLOWUP-01..02 + CRON-HEALTH-01..05 (Source Reliability + Cron Health)
  └── blocks NOC pulse-strip truthfulness for any cron-sourced metric
  └── blocks Schedules Console (console reads from the job registry those requirements define)

NOC Real-Data (NOC-01..14 + OPS-AUDIT-01..04)
  └── depends on Source Reliability + Cron Health telemetry streams
  └── depends on Auth Hardening for role-aware panel visibility
```

**Recommended phase order:** Memory Security → Auth Hardening (parallel) → Source Reliability + Cron Health + Schedules Console → NOC Real-Data + Ops Audit → Harness Control Plane + Evidence

---

## Feature 1: Memory Security Foundation (MEMSEC-01..08 + CTX-FOLLOWUP-03)

### Table Stakes

These are non-negotiable for a system trusted with organizational memory containing legal,
finance, HR, credentials, and personal data:

| Feature | Why Expected | Complexity |
|---------|--------------|------------|
| Encryption at rest for sensitive artifacts | Industry baseline; any compliance conversation requires it | Medium |
| Role-based access control on memory retrieval | Expected wherever RBAC auth exists (v3.0 shipped RBAC) | Medium |
| Audit log of memory access decisions | Already established for actions; memory reads must follow the same pattern | Low |
| Retention policy per artifact | Legal and HR teams expect data to expire | Medium |
| Content classification at ingestion | Required before multi-user or customer exposure | High |

### Differentiators

MemroOS-specific — not commoditized in competing agent hubs:

| Feature | Value Proposition | Complexity |
|---------|-------------------|------------|
| Classification-aware safe indexes | Restricted content silently omitted from FTS/vector/graph rather than relying on prompt-layer guards | High |
| Two-gateway model (ingestion + retrieval) | Both ingest-time classification AND retrieval-time authorization — most systems only enforce one | High |
| Redacted projections with vault provenance | Restricted content can still answer low-sensitivity questions via approved redacted summaries; not a binary allow/deny | High |
| Deterministic detectors before LLM adjudication | LLM hallucination risk eliminated for the hard cases (PII, credentials, legal markers) by running regex/NER/source-path gates first | Medium |
| Human review queue as a first-class release valve | Uncertain and conflicting cases route to human review rather than blocking recall entirely — prevents over-classification paralysis | Medium |
| Label schema with independent dimensions | Visibility / domain / sensitivity / policy tracked independently, not a single overloaded enum; label combinations compose correctly | Medium |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Freeform LLM-only classifier for sensitive labels | High hallucination risk on legal, finance, HR decisions; no evidence spans; cannot be audited | Deterministic detectors first, constrained LLM adjudicator (strict JSON with evidence spans + abstention) second |
| Whole-database encryption as the primary leak-prevention boundary | Process-level decryption gives app-layer recall full access — encryption does not prevent recall leaks after unlock | Classification at ingestion + authorization at retrieval is the correct primary boundary; encryption is defense-in-depth |
| Raw binary media in SQLite as long-term source | SQLite rows bloat; no content-addressed deduplication; no compression; no replay | Binary media in raw vault (append-only compressed artifacts); SQLite holds metadata only |
| Automatic public promotion from emails/meetings/DMs/finance/legal sources | No evidence = no promotion; these sources are private by default | Require positive approval evidence with human review for any public visibility transition |
| Embedding sensitive raw content by default | Embeddings in Qdrant/vector store inherit the sensitivity of source; restricted content must not reach vector indexes | Only embed where `indexable=true`; use approved redacted projections otherwise |
| Over-classifying everything private so recall returns nothing | Fail-closed means private-by-default, not private-forever; the system must have a promotion path | Default private + deterministic promotion rules + human review queue + redacted projection paths |
| Blocking recall on all restricted content without a redacted-projection path | Binary deny makes the system unusable for mixed-sensitivity content | Return redacted snippet or omit restricted fields; log the redaction decision for audit |

### Feature Dependencies

```
Existing RBAC (v3.0) → retrieval authorization gate (actors have roles to check against)
Existing content scanner (v1.5, 18 patterns) → deterministic detectors (generalizes scanner to ingestion gate)
Existing audit log (v1.5) → memory access audit events (extend existing log)
Existing MemoryAdapter interface (v4.0) → classification-aware writes (adapters check labels before indexing)
```

**Complexity:** HIGH. Schema migration touches messages / audit / recall logs / memory writes / vector metadata / graph facts. Envelope encryption with rotation. Cascade design (deterministic → LLM adjudicator → human review queue). Negative regression tests are load-bearing.

---

## Feature 2: Auth Hardening (AUTH-FOLLOWUP-01..03)

### Table Stakes

| Feature | Why Expected | Complexity |
|---------|--------------|------------|
| Password reset via email | Every auth system ships this; absence blocks legitimate use and signals security immaturity | Low |
| Email verification | Required before trusting an address for notifications or MFA | Low |
| Email invitations for team members | Required for any multi-user deployment; manual credential sharing is insecure | Low |
| OAuth/SSO login | Expected in any enterprise-adjacent product; teams use Google/GitHub/OIDC | Medium |
| Login lockout and refresh telemetry | NIST 800-63B baseline; rate limiting on credential attacks | Low-Medium |
| Role-aware UI gating (hide/disable before click-through) | UX expectation once RBAC exists — operators should not see and then be denied | Medium |
| Tenant settings management | Expected once tenants are a concept | Medium |
| API key rotation UI | Required for any API-key-based integration surface | Low |

### Differentiators

| Feature | Value Proposition | Complexity |
|---------|-------------------|------------|
| User lifecycle management with audit trail | Beyond basic CRUD — identity events (invite, activate, deactivate, role change) written to immutable audit log | Medium |
| Migration of legacy audit actor fields to authenticated identity | Audit rows written before RBAC landed reference raw actor strings; linking them to real identities improves incident response | Medium |
| Delegated user access for agent-mediated data | User responsibility follows the agent into data-element policy checks through user id, OAuth subject/scope/consent, encrypted credential reference, and agent id/version | Medium |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Introducing new roles before AUTH-FOLLOWUP-01..03 ships | Retrofitting role checks is the documented failure mode; role UI surfaces without complete auth is a half-gate | Complete auth hardening first, then add roles |
| Full MFA (TOTP/FIDO2) in this milestone | Adds significant implementation surface; lockout telemetry and SSO cover the immediate risk | Defer TOTP/FIDO2 to v5.1; ship lockout telemetry and SSO as the v5.0 floor |
| Building a custom OAuth2 authorization server | Unnecessary complexity; MemroOS consumes OAuth (delegates to provider), it does not need to be a provider | Use next-auth or a well-supported OAuth consumer library |

### Feature Dependencies

```
Existing JWT + RBAC (v3.0) → OAuth/SSO (same session machinery, new provider)
Existing audit log (v1.5) → user lifecycle audit events
Existing email delivery (none yet) → email invitations + password reset (net new dependency: transactional email)
```

**Complexity:** MEDIUM. Well-trodden patterns. Email delivery integration (transactional email provider) is the main novel piece. OAuth/SSO requires choosing a library (next-auth is the established Next.js option) and configuring providers. Role-aware UI gating requires a systematic pass through all nav and action surfaces.

---

## Feature 3: Context Source Reliability + Cron Health + Schedules Console
(CTX-FOLLOWUP-01..02, CRON-HEALTH-01..05, UX-FOLLOWUP-03)

### Table Stakes

| Feature | Why Expected | Complexity |
|---------|--------------|------------|
| All source families declare ingest/index/freshness/safe-answer/repair contracts | The source-contract pattern was introduced in v3.1 for a starter set; operators expect consistency across all configured sources | Medium |
| Cron job heartbeat monitoring (job checks in; alert if missed) | Industry standard (Cronitor, Healthchecks.io, Honeybadger); expected for any scheduled task system | Low-Medium |
| Caught-up vs running-behind status per job | Beyond heartbeat — show whether the job is keeping up with its backlog | Medium |
| Warning/critical signals with configurable thresholds | Without thresholds, "missed heartbeat" is binary; operators need graduation (warning = 1 miss, critical = 3 consecutive misses) | Medium |
| Pause/resume/stop controls per job | Standard in every cron monitoring product; required during maintenance/migrations | Low |
| Declarative job registry (all scheduled work in one place) | Operators should not have to grep source code to find what runs on a schedule | Medium |
| Schedules console UI showing all recurring jobs | Expected visibility; if it runs on a schedule, it should be visible in the console | Medium |

### Differentiators

| Feature | Value Proposition | Complexity |
|---------|-------------------|------------|
| Source-to-QMD indexing proof (visible in the UI) | Operators can verify that a source they configured actually contributed to the QMD index | Medium |
| Standing delegations and approval-required automations in the console | Beyond cron jobs — shows which agent automations run on a schedule and which require approval before execution | Medium |
| Memory degradation paths visible (queued writes, retry backlog, stale recall) | Most systems only show "service reachable"; MemroOS shows whether memory is actually current and usable | Medium |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Broad rewrite of context-source ingestion before source-contract gaps are understood | Over-engineering without knowing the gap scope | Audit existing sources against the contract template first (CTX-FOLLOWUP-01), then fill gaps incrementally |
| External cron monitoring SaaS dependency (Cronitor, Healthchecks.io) | Adds an external dependency and privacy surface for an internal scheduling system | Implement heartbeat + caught-up status as first-class internal telemetry written to existing SQLite audit/health infrastructure |
| Embedding the Schedules Console into the NOC home | NOC home is a summary view; schedules detail belongs in its own dedicated page | Dedicated `/schedules` route with NOC summary strip pulling from it |

### Feature Dependencies

```
Existing context source contracts (v3.1) → source-contract extension to new families
Existing scheduler pattern (v1.5, instrumentation.ts) → declarative job registry (all crons become declared entries)
Existing health/audit tables (SQLite, v1.5) → heartbeat + caught-up telemetry written here
Source reliability (CTX-FOLLOWUP-01..02) → Schedules Console (console reads from job registry those requirements define)
```

**Complexity:** MEDIUM. The source-contract pattern exists; this is coverage extension. The declarative job registry pattern is established (instrumentation.ts); formalizing it is mechanical. Net-new work: caught-up vs running-behind logic, configurable warning/critical thresholds, pause/resume API, and the Schedules Console UI.

---

## Feature 4: NOC Real-Data + Operations Audit (NOC-01..14, OPS-AUDIT-01..04)

### Table Stakes

| Feature | Why Expected | Complexity |
|---------|--------------|------------|
| All 14 NOC panels backed by live data, not mock constants | The NOC home is presented as an operational truth surface; mock data is a trust violation once the system is in production use | Medium |
| Per-panel provenance: source, lastUpdated, window, status (live/empty/degraded/missing) | Without provenance, operators cannot tell whether a number is stale, fabricated, or genuinely zero | Medium |
| Every NOC control is actionable (navigate, mutate, explain missing-backend) | Inert buttons on a control plane surface signal incomplete work and erode operator trust | Medium |
| Date-range/time-window controls propagate to live-backed panels | Standard for any time-series dashboard; without it, operators cannot correlate events | Medium |
| Honest empty/degraded states instead of fabricated metrics | Missing-telemetry checklist for unbuilt signals; degraded indicator for partial data | Low |

### Differentiators

| Feature | Value Proposition | Complexity |
|---------|-------------------|------------|
| Efficiency signals (retrieval calls before useful work, same-source re-read count, raw-context ingest token share, operator re-ask redundancy, rediscovered-fact rate) | These are MemroOS-unique intelligence signals that expose agent inefficiency patterns not visible in any other dashboard | HIGH — require new telemetry instrumentation before they can be shown |
| Unified `/api/operations/noc` contract (per-panel provenance, degraded states) | Consumers (mobile, future integrations) get a single normalized endpoint rather than assembling from 10+ APIs | Medium |
| Security classification coverage visible in NOC governance strip | How many ingested items are classified, how many are in the human review queue, classification throughput | Medium (depends on MEMSEC) |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Inline NOC engagement/chat controls | NOC-13 is explicit: engagement belongs on `/dispatch`; inline console creates a second partial implementation of chat/dispatch | Remove inline console from NOC; link to `/dispatch` from agent panel |
| Visual redesign or navigation restructure in this phase | Out of scope per NOC requirements note; this is a data-wiring corrective phase | Wire existing panels to live data; defer visual redesign to Paperclip design-system completion (UX-FOLLOWUP-05) |
| Showing efficiency signals with sample/placeholder numbers until telemetry exists | Fabricated metrics on a live dashboard are the exact failure mode being fixed | Show missing-telemetry checklist until the event streams are instrumented |
| A new unified endpoint before panels are individually wired | Building a complex aggregation endpoint before knowing which panels need what data is premature abstraction | Wire panels to existing hooks first; extract the unified endpoint once the normalization surface is clear |

### Feature Dependencies

```
Source Reliability + Cron Health (CTX-FOLLOWUP-01..02, CRON-HEALTH-01..05) → cron-sourced NOC metrics
Auth Hardening (AUTH-FOLLOWUP-01..03) → role-aware panel visibility and governance strip accuracy
Memory Security (MEMSEC) → classification coverage metrics in governance strip
Existing live APIs (agents, hive, activity, tokens, memory-stats, model-routing, audit-log, security/report) → most NOC panels can wire now
New efficiency telemetry streams (NOC-10) → efficiency panel (net-new instrumentation required)
```

**Complexity:** MEDIUM-HIGH. Most panels have live API sources to wire; 14 panels is breadth, not depth. The efficiency telemetry streams (NOC-10) are net-new instrumentation, which is the hardest part. Every NOC control being actionable requires a systematic audit sweep.

---

## Feature 5: Harness Control Plane + Evidence Bundles

### Table Stakes

| Feature | Why Expected | Complexity |
|---------|--------------|------------|
| Task-level Plan-Execute-Verify timeline | Once task evidence bundles exist (v4.0 SEAL-06 shipped a first slice for eval/skill work), operators expect this for all dispatched tasks | High |
| Evidence bundle on every agent output (sources, memories, tools, checks, assumptions, residual risks, replay handle) | v4.0 shipped evidence bundles for SEAL proposals; v5.0 makes this universal — expected consistency | High |
| Shared harness state with read/write sets | Operators expect to see what context an agent assembled before acting; surprises during action are a trust failure | High |
| Explicit assumptions and version dependencies in task state | Required for incident root cause; "agent assumed X was true" must be inspectable after the fact | Medium |

### Differentiators

| Feature | Value Proposition | Complexity |
|---------|-------------------|------------|
| Conflict policy for overlapping read/write sets | Detects when two concurrent tasks could produce inconsistent state before they execute | High |
| Stale belief / context drift surfacing | Shows when a task's assembled context is based on information that has been superseded — before the task acts | High |
| Verifier obligations in task state | Each task declares what checks must pass before its output is accepted; harness enforces these, not downstream consumers | High |
| Replay/rollback handles on every evidence bundle | Universal replay enables incident reproduction and regression test construction from real production task runs | High |
| Vault provenance in evidence bundles (artifact IDs from raw vault) | Bundles cite the raw evidence they were assembled from — not just summaries | Medium (depends on MEMSEC raw vault) |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Building universal evidence bundles before the raw vault and label schema exist | Evidence bundles without vault provenance are orphaned summaries with no audit chain | Ship MEMSEC raw vault first; evidence bundles reference artifact IDs |
| Over-engineering shared harness state into a distributed coordination protocol | This is a single-operator system; shared state is a SQLite table with declared read/write sets, not a distributed lock manager | Declare read/write sets as metadata; detect conflicts in application logic, not a separate coordination service |
| Exposing full internal graph state to operators via the evidence bundle UI | Security + UX footgun (same anti-pattern as HIL full-state editor) | Expose declared fields and evidence spans; raw internal state stays internal |

### Feature Dependencies

```
MEMSEC raw vault + label schema (MEMSEC-01..02) → evidence bundle vault provenance
v4.0 SEAL evidence bundles (SEAL-06) → universal evidence bundle (generalize existing pattern)
v4.0 LangGraph orchestration + lineage (ORCH-08..10) → Plan-Execute-Verify timeline data source
Existing audit log (v1.5) → verification run outcomes written as audit events
```

**Complexity:** HIGH. Universal evidence bundles require touching every dispatched task path. Shared harness state with read/write sets and conflict detection is new architecture. Context drift surfacing depends on having fresh source contracts (CTX-FOLLOWUP-01..02) to compare against. This is the most architecturally novel work in v5.0.

---

## Feature Dependencies Graph (v5.0)

```
MEMSEC-02 (label schema)
  ├── MEMSEC-01 (raw vault)
  │     └── Harness Control Plane evidence bundle provenance
  ├── MEMSEC-03 (ingestion classification)
  │     └── CTX-FOLLOWUP-03 (privacy classification policy)
  ├── MEMSEC-04 (retrieval gate)
  │     └── MEMSEC-05 (safe indexes) → blocks UX-FOLLOWUP-02 (memory search surface)
  ├── MEMSEC-06 (multimodal)
  ├── MEMSEC-07 (encryption)
  └── MEMSEC-08 (regression tests)

AUTH-FOLLOWUP-01 (email invitations + password reset + OAuth/SSO)
  └── AUTH-FOLLOWUP-02 (role-aware UI gating)
        └── AUTH-FOLLOWUP-03 (tenant settings + API-key rotation + user lifecycle)

CTX-FOLLOWUP-01 (source contracts coverage)
  └── CTX-FOLLOWUP-02 (runtime health: degradation paths)
        └── CRON-HEALTH-01..05 (heartbeat + caught-up + controls + registry)
              └── UX-FOLLOWUP-03 (Schedules Console)
                    └── NOC-01..14 (cron-sourced NOC metrics unblock)

NOC-01..14 (real data wiring) ← Auth Hardening complete, Source Reliability complete
OPS-AUDIT-01..04 ← all live APIs wired
```

---

## Complexity Summary

| Feature Group | Complexity | Primary Risk |
|--------------|-----------|-------------|
| Memory Security Foundation | HIGH | Schema migration scope (messages/audit/recall/vector metadata/graph facts); cascade design; regression test authoring |
| Auth Hardening | MEDIUM | Transactional email delivery is the net-new dependency; OAuth requires provider configuration; role-aware UI pass is breadth |
| Source Reliability + Cron Health + Schedules | MEDIUM | Caught-up vs running-behind logic is novel; coverage extension of existing source-contract pattern is mechanical |
| NOC Real-Data + Ops Audit | MEDIUM-HIGH | 14 panels is breadth; efficiency telemetry (NOC-10) is the hard net-new instrumentation; actionable controls requires sweep |
| Harness Control Plane + Evidence | HIGH | Universal coverage is invasive; shared harness state model is new architecture; vault provenance dependency on MEMSEC |

---

## MVP Recommendation

Prioritize in this order, respecting hard dependencies:

1. **MEMSEC-02** (label schema) — no other security work can start without it; design-first, implement immediately
2. **MEMSEC-01, 03, 04, 07** (raw vault + ingestion gate + retrieval gate + encryption) — core security chain; ship as a unit
3. **MEMSEC-05, 06, 08** (safe indexes + multimodal + regression tests) — follow-on security hardening in same phase
4. **AUTH-FOLLOWUP-01** (email invitations + password reset + OAuth/SSO) — parallelize with MEMSEC; unblocks team onboarding
5. **AUTH-FOLLOWUP-02, 03** (UI gating + tenant management) — depends on 01 for role foundations
6. **CTX-FOLLOWUP-01..02 + CRON-HEALTH-01..05** (source reliability + cron health) — unblocks NOC and Schedules Console
7. **UX-FOLLOWUP-03** (Schedules Console) — depends on CRON-HEALTH job registry
8. **NOC-01..11** (real data wiring) — most panels wire now; efficiency telemetry (NOC-10) is the long pole
9. **NOC-12..14 + OPS-AUDIT-01..04** (actionable controls + ops audit sweep) — cleanup pass after data wiring
10. **Harness Control Plane + Evidence** — ship last; depends on raw vault provenance from MEMSEC

Defer to v5.1: UX-FOLLOWUP-02 (memory search surface — depends on MEMSEC retrieval gate being stable), TOTP/FIDO2 MFA, full efficiency telemetry if instrumentation scope grows.

---

## Sources

- Memory security two-gateway model and label schema: `.planning/notes/memory-security-storage-spike.md`
- Privacy classification cascade design: `.planning/notes/privacy-classification-policy-spike.md`
- NOC real-data requirements and mock-data inventory: `.planning/notes/operations-noc-real-data-requirements.md`
- Active v5.0 requirements: `.planning/REQUIREMENTS.md` (MEMSEC-01..08, CTX-FOLLOWUP-01..03, CRON-HEALTH-01..05, NOC-01..14, OPS-AUDIT-01..04, AUTH-FOLLOWUP-01..03)
- Cron job heartbeat monitoring patterns: [Healthchecks.io](https://healthchecks.io/), [Cronitor](https://cronitor.io/cron-job-monitoring), [Honeybadger](https://www.honeybadger.io/tour/cron-job-heartbeat-monitoring/)
- OpenTelemetry GenAI agent observability: [OTel AI Agent blog](https://opentelemetry.io/blog/2025/ai-agent-observability/)
- OpenInference conventions for LLM + tool tracing: [MintMCP OpenTelemetry agents](https://www.mintmcp.com/blog/opentelemetry-ai-agents)
- NIST 800-63B (lockout telemetry baseline for auth hardening): NIST Digital Identity Guidelines
