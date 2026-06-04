# MemroOS Governance Architecture

Status: canonical governance spine for MemroOS agent-memory and orchestration surfaces.

MemroOS governance is native to the broker. It is not delegated to a data catalog by default. External catalog systems such as Datastrato or Apache Gravitino become relevant when MemroOS must govern access to enterprise lakehouse, warehouse, model-registry, vector-index, or feature-store assets outside the MemroOS evidence vault.

## Decision

MemroOS uses one policy decision model across agent actions, memory writes, memory use, context assembly, exports, indexing, and operator review:

`Actor -> Action -> Asset -> Purpose -> Label -> Decision -> AuditEvent`

This model keeps policy close to the surfaces agents actually use. A catalog can provide asset metadata later, but MemroOS remains the policy decision point for agent behavior.

## Agentic Stack Coverage

ARCH-01 requires MemroOS to document and verify coverage across the agentic AI stack. The governance boundary for each layer is:

| Layer | Governance control | Current owner |
| --- | --- | --- |
| Goal | Task objective, delegated user, project, purpose, and approval state must be explicit before execution. | Evidence bundles, Dispatch, HIL |
| Orchestration | Multi-step work routes through durable tasks, checkpoints, HIL, and retry state. | A2A broker, LangGraph proxy, HIL |
| Agents | Agents must have canonical identity, platform/protocol metadata, capabilities, and security mode. | Agent registry |
| Tools | Tool/delegation use is checked against declared capabilities and operating-profile network policy. | `security-policy.ts` |
| Memory | Writes and reads are tiered, labeled, and gated by actor, role, capability, purpose, and label. | `policy-gate.ts`, memory tiers |
| Monitoring | Governance events are visible through audit, security report, NOC, and compliance surfaces. | Audit log, `/api/security/report`, NOC |
| Reliability/failure handling | Degraded memory, queued writes, retry backlog, replay verification, and source freshness must surface as degraded, not as silent success. | Cron/source health, memory trace observability |
| Governance/security | Default-private labels, raw evidence vault, encryption, HIL review, redacted denials, and regression fixtures prevent policy bypass. | Vault, classifier cascade, audit, tests |

## Actors

Actors are never inferred only from prompt text.

| Actor type | Examples | Minimum governance metadata |
| --- | --- | --- |
| Human user | admin, operator, reviewer | user id, tenant id, role |
| Local agent | Codex, Claude Code, Hermes, ChatGPT Actions bridge | agent id, platform, capabilities, delegated user when applicable |
| Remote agent | A2A or REST registered agents | agent id, protocol, endpoint, security mode, declared skills/capabilities |
| System job | cron, ingestion, consolidation, indexer | job id, tenant/project, purpose, schedule provenance |
| Anonymous/external | public fetch, unauthenticated request | denied by default unless asset is explicitly public approved |

## Actions

Actions are normalized before policy evaluation:

| Action family | Examples | Default posture |
| --- | --- | --- |
| Memory write | semantic, episodic, graph, checkpoint, handoff | require agent capability and classification label |
| Memory use | recall, multi-search, context-pack, ChatGPT Action fetch | deny sealed/private unless label allows use |
| Index write | FTS, embedding, graph, qmd projection, evidence bundle | require `policy=indexable` or approved redacted projection |
| Task/delegation | dispatch, A2A send, agent context message | require capability and network/profile policy |
| Export/publication | report, public page, downloadable artifact | require explicit public approval or human review |
| Sensitive side effect | email, post, purchase, irreversible file or API action | require operator mandate or HIL approval |

## Assets

Assets carry labels and provenance. Raw content and derived projections are separate assets.

| Asset | Source of truth | Governance rule |
| --- | --- | --- |
| Raw artifact | `raw_artifacts` plus vault file | append-only, hash-verified, encrypted when sensitive |
| Label | `artifact_labels` or label columns | independent visibility, domain, sensitivity, policy dimensions |
| Message/memory row | SQLite or memory backend metadata | default `private` and `sealed` until classified |
| Derived index | FTS, embedding, vector, graph, qmd | only indexable content or approved redacted projection |
| Task/evidence bundle | task evidence tables and audit rows | cite actor, purpose, tools, decisions, and verification |
| Agent/tool capability | canonical registry | deny declared-but-insufficient capability |

## Labels

The canonical label dimensions are independent:

| Dimension | Values |
| --- | --- |
| `visibility` | `private`, `internal`, `public_safe`, `public_approved` |
| `domain` | `legal`, `finance`, `hr`, `client`, `personal`, `engineering` |
| `sensitivity` | `pii`, `secret`, `credential`, `privileged`, `contract`, `payment`, `health` |
| `policy` | `indexable`, `agent_visible`, `requires_redaction`, `requires_human_review`, `sealed` |

Default is `visibility=private` and `policy=sealed`. Public promotion requires positive proof and review evidence. Absence of a detector hit is not approval.

## Policy Decision Contract

Every policy decision returns one of:

| Decision | Meaning | Required behavior |
| --- | --- | --- |
| `allow` | Actor may use the asset for the stated purpose. | Return the asset or write the derived projection. |
| `deny` | Actor may not use the asset. | Return a redacted structured error or omit the result. |
| `redact` | Actor may use an approved redacted projection. | Never return raw content. |
| `review-required` | Human review is required before use. | Create or surface a review/HIL item. |

Every decision must write an audit event with actor, role, capability, tenant/project, purpose, label snapshot, target, decision, and reason. Audit details must not contain raw secrets or sensitive content.

## Mandatory Gates

| Gate | Requirement | Implementation anchor |
| --- | --- | --- |
| Agent capability gate | A declared agent cannot use missing dispatch, A2A, or memory capabilities. | `apps/memroos/src/lib/security-policy.ts` |
| Memory use gate | Recall, context packs, ChatGPT Actions, export, summary, dispatch, and index writes must check labels. | `apps/memroos/src/lib/memory/policy-gate.ts` |
| Raw vault gate | Sensitive raw context lands in compressed, hash-addressed vault artifacts with label rows and encryption key ids. | `apps/memroos/src/lib/vault/writer.ts` |
| Encryption gate | Sensitive vault artifacts use app-level envelope encryption. | `apps/memroos/src/lib/vault/envelope.ts` |
| Auth/RBAC gate | Admin/operator/reviewer roles gate admin and operator APIs. | `apps/memroos/src/lib/auth/middleware-roles.ts` |
| Audit/HIL gate | Policy decisions, admin changes, HIL events, and escalations are queryable. | `apps/memroos/src/lib/audit/schema.ts` |
| Compliance gate | Runtime compliance controls are admin-only and audit changes. | `apps/memroos/src/app/api/admin/compliance/route.ts` |

## GitNexus Review Gate

Broad dirty trees must not be closed from a single global `detect_changes(scope=unstaged)` result. If more than one logical change is present, split the tree into review scopes before verification:

1. Unstage everything.
2. Stage exactly one logical scope, such as governance docs, a single feature, shared schema, or planning/GSD closeout.
3. Run `GitNexus detect_changes(repo="memroos", scope="staged")`.
4. Record changed count, affected count, changed files, risk level, and affected processes in the phase verification note.
5. For any HIGH or CRITICAL staged scope, run targeted `GitNexus impact` on the named high-risk symbols and record direct callers, affected processes, affected modules, verification coverage, and accepted or remaining risk.
6. Repeat for every scope, then unstage everything unless the next step is an intentional commit.

A CRITICAL result is not automatically a failure. It is acceptable only when the verification note explains why the scope is broad, which symbols create the blast radius, which focused tests cover the change, and what follow-up remains.

## Datastrato Decision Rule

Do not add Datastrato, Apache Gravitino, or another metadata lake as a dependency for the current MemroOS governance layer.

Add an external catalog adapter only when at least one of these is true:

- MemroOS must vend short-lived credentials for external enterprise data assets.
- Agents need governed discovery of lakehouse, warehouse, feature-store, model-registry, or vector-index assets outside the MemroOS vault.
- A customer already has a catalog/IAM authority that must remain the source of truth.
- Audit needs to correlate MemroOS agent actions with external data-plane access logs.

When that happens, the catalog is an asset metadata and credential-vending input. MemroOS still evaluates `Actor -> Action -> Asset -> Purpose -> Label -> Decision -> AuditEvent` before exposing context to an agent.

## Requirement Gap Matrix

| Requirement | Status | Evidence | Remaining work |
| --- | --- | --- | --- |
| `MEMSEC-01` | Closed | Raw evidence vault, hash, replay, labels. | None for current milestone. |
| `MEMSEC-02` | Closed | Multi-dimensional labels. | None for current milestone. |
| `MEMSEC-03` | Closed | Fail-closed classification cascade and review path. | Keep golden sets fresh as sources expand. |
| `MEMSEC-04` | Closed | Memory use policy gate. | Expand call-site coverage when new retrieval surfaces are added. |
| `MEMSEC-05` | Closed | Classification-aware FTS/index projections. | Re-run restricted-content sweeps after new indexes. |
| `MEMSEC-06` | Closed | Embedding provenance fields. | Add non-text modalities only after raw media vaulting is proven. |
| `MEMSEC-07` | Closed | Envelope encryption and key provider. | Keep backup/restore drills in release checklist. |
| `MEMSEC-08` | Closed | Security regression fixtures. | Add negative fixtures for every new connector. |
| `CTX-FOLLOWUP-03` | Closed | Privacy classification policy cascade. | Keep deterministic detectors ahead of LLM adjudication. |
| `NOC-08` | Closed | Live governance strip. | Preserve honest degraded states. |
| `ARCH-01` | Closed by this document | Stack coverage and `npm run check:governance`. | Re-run checker after governance changes. |
| `AUDIT-FOLLOWUP-01` | Open | Existing audit rows are queryable, but tamper-evident chaining and retention policy are not the canonical compliance layer yet. | Add hash chaining, retention/archive config, and restore verification. |
| `AUDIT-FOLLOWUP-02` | Open | HIL queue exists. | Add email/webhook/Slack notifications, bulk resolution, and SLA escalation UX. |
| `AUDIT-FOLLOWUP-03` | Open | Audit APIs exist for operator use. | Add tenant-scoped customer API access and full-text audit search. |
| External catalog adapter | Not required | MemroOS-owned assets are governed natively. | Revisit only when the Datastrato decision rule is triggered. |

## Verification

Run:

```bash
npm run check:governance
```

The checker verifies that this document covers the stack layers, names the governance spine, maps the core implementation anchors, and keeps the current security requirements tied to their requirement ids.
