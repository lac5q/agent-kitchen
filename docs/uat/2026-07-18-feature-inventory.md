# MemRoOS UAT Feature Inventory - Created 2026-07-18 07:21:31Z / Updated 2026-07-18 07:21:31Z - Version 2026-07-18.1

## Scope and sources

This pack defines practical, risk-based UAT coverage for the MemRoOS Next.js app at `apps/memroos`.

| Source | Date inspected | Use in this pack |
| --- | ---: | --- |
| `/tmp/uat-routes.json` | 2026-07-18 | Primary route inventory: 35 pages and 211 API paths. |
| `apps/memroos/src/app/**/page.tsx` | 2026-07-18 | Confirmed page inventory and user-facing page intent. |
| `apps/memroos/src/app/api/**/route.ts` | 2026-07-18 | Confirmed representative API groups, methods, and risk areas. |
| `apps/memroos/src/proxy.ts` | 2026-07-18 | Confirmed public/app host split, auth redirects, route-local auth exceptions, and RBAC gates. |
| `apps/memroos/src/components/layout/sidebar.tsx` and `shell.tsx` | 2026-07-18 | Confirmed operator console navigation groupings and section tabs. |
| `.gitignore` | 2026-07-18 | Confirmed `/apps/memroos/data/` is ignored for local sanitized fixtures. |

Notes:
- The route JSON contains three malformed dynamic page strings (`/blog/{slug`, `/invite/{token`, `/vs/{competitor`) that correspond to actual app pages `/blog/[slug]`, `/invite/[token]`, and `/vs/[competitor]`; test plans should use the actual URL shapes.
- Human app roles are `admin`, `operator`, and `reviewer` in auth code. This UAT pack uses the requested `agent` role for programmatic/API-key and agent-runtime actors; reviewer behavior should be tested as the lowest human role when needed.
- Degraded optional services are expected in local/cloud UAT unless explicitly provisioned; verify graceful degradation, not external service health, for mem0, orchestration backends, Ollama, Neo4j, Qdrant, and voice integrations.

## Inventory: pages and routes

| # | Route from `/tmp/uat-routes.json` | Actual app route | Surface | Auth expectation | Primary UAT focus |
| ---: | --- | --- | --- | --- | --- |
| 1 | `/` | `/` | Public landing or operator NOC, host-dependent | Public on marketing host; login required on app host | Landing conversion copy or operations command center. |
| 2 | `/agent-autogen` | `/agent-autogen` | Improve | Human login | Generated agent-card candidates and proposal handling. |
| 3 | `/agents` | `/agents` | Agents | Human login | Agent registry, cards, versions, registration visibility. |
| 4 | `/apo` | `/apo` | Improve | Human login | Agent Performance Optimizer proposal queue. |
| 5 | `/audit` | `/audit` | Governance | Human login | Audit log browsing and filtering. |
| 6 | `/blog/{slug` | `/blog/[slug]` | Public marketing/content | Public on marketing host | Blog post rendering, invalid slug behavior. |
| 7 | `/blog` | `/blog` | Public marketing/content | Public on marketing host | Blog index, SEO metadata, links. |
| 8 | `/business-ops` | `/business-ops` | Operations | Human login | Finance reconciliation or business outcome view. |
| 9 | `/cookbooks` | `/cookbooks` | Skills | Human login | Filesystem-discovered skills and tool suggestions. |
| 10 | `/dispatch` | `/dispatch` | Engage | Human login | Dispatch/chat/standup entry points. |
| 11 | `/escalations` | `/escalations` | Governance | Human login | Human-in-the-loop queue and resolution state. |
| 12 | `/evals` | `/evals` | Improve | Human login | Evaluation runs, config, history, drift guardrails. |
| 13 | `/flow` | `/flow` | Workflow map | Human login | Work graph and agent runtime flow visualization. |
| 14 | `/invite/{token` | `/invite/[token]` | Auth/onboarding | Token-scoped public page | Invite validation and registration handoff. |
| 15 | `/ledger` | `/ledger` | Operations | Human login | Token spend, model economics, usage reporting. |
| 16 | `/library` | `/library` | Memory/knowledge | Human login | Knowledge library freshness and search. |
| 17 | `/login` | `/login` | Auth | Public | Login, validation, lockout/rate-limit messaging. |
| 18 | `/meetings` | `/meetings` | Engage | Human login | Meeting join and engagement workflow. |
| 19 | `/memory-autogen` | `/memory-autogen` | Improve | Human login | Generated memory policy proposal review. |
| 20 | `/notebooks` | `/notebooks` | Memory | Human login | Retained memory browsing and empty/error states. |
| 21 | `/platform` | `/platform` | Public marketing | Public on marketing host | Platform positioning and CTA routing. |
| 22 | `/register` | `/register` | Auth | Public/token-aware | Registration, invite consumption, duplicate account handling. |
| 23 | `/seal` | `/seal` | Improve | Human login; operator for writes | SEAL proposals, jobs, audit and evidence. |
| 24 | `/settings/api-keys` | `/settings/api-keys` | Governance | Human login | Generate/copy/revoke keys; key visible once. |
| 25 | `/settings/compliance` | `/settings/compliance` | Governance | Admin for compliance API writes | Compliance posture, residency, retention controls. |
| 26 | `/skills` | `/skills` | Skills | Human login | Governed skill registry, import, lifecycle, pins, quarantine. |
| 27 | `/team` | `/team` | Governance | Admin for user list/invites | Team members, roles, invitation links. |
| 28 | `/understand` | `/understand` | Understand graph | Shellless app route | Graph rendering with noindex headers and safe public policy. |
| 29 | `/use-cases/engineering` | `/use-cases/engineering` | Public marketing | Public on marketing host | Engineering use-case content and links. |
| 30 | `/use-cases` | `/use-cases` | Public marketing | Public on marketing host | Use-case index and navigation. |
| 31 | `/use-cases/product` | `/use-cases/product` | Public marketing | Public on marketing host | Product use-case content and links. |
| 32 | `/use-cases/sales` | `/use-cases/sales` | Public marketing | Public on marketing host | Sales use-case content and links. |
| 33 | `/vs/{competitor` | `/vs/[competitor]` | Public marketing | Public on marketing host | Competitor page rendering, unknown competitor handling. |
| 34 | `/vs` | `/vs` | Public marketing | Public on marketing host | Comparison index and internal links. |
| 35 | `/wiki` | `/wiki` | Memory/wiki | Human login | Digested wiki browsing and search. |

## Inventory: major API groups

The 211 API paths in `/tmp/uat-routes.json` are best tested by group with representative happy-path, auth, validation, and failure cases.

| API group | Count in route JSON | Representative paths | Primary actors | UAT priority |
| --- | ---: | --- | --- | --- |
| Skills governance | 23 | `/api/skills`, `/api/skills/import`, `/api/skills/pins`, `/api/skills/proposals`, `/api/skills/quarantine`, `/api/skills/sync`, `/api/skills/verify` | Admin, operator, agent | High - dispatch safety and supply-chain controls. |
| Memory lifecycle | 12 | `/api/memory-lifecycle/audit`, `/retention`, `/expiry`, `/legal-holds`, `/subject-erasure`, `/vault`, `/tombstones`, `/graph-catchup` | Admin, operator | High - compliance and deletion correctness. |
| Memory retrieval and inventory | 11 | `/api/memory`, `/api/memory/add`, `/api/memory/search`, `/api/memory/multi-search`, `/api/memory/graph`, `/api/memory/health`, `/api/memory/okf/export` | Operator, agent | High - core product value and privacy boundaries. |
| GSD/cloud workflow helpers | 10 | `/api/gsd/goal`, `/api/gsd/discuss`, `/api/gsd/resume`, `/api/gsd/shipcheck`, `/api/gsd/model-route`, `/api/gsd/standup` | Operator, agent | Medium - productivity workflow continuity. |
| Orchestration and HIL | 10 | `/api/orchestration`, `/plans/validate`, `/plans/execute`, `/runs/[id]/evidence`, `/hil`, `/hil/[id]/edit` | Operator, agent | High - execution safety and rollback/resume behavior. |
| Agents and A2A registry | 11 | `/api/agents`, `/api/agents/register`, `/api/agents/[id]`, `/api/agents/versions`, `/api/a2a/openapi`, `/api/a2a/agents/register` | Operator, agent | High - registered agent identity and capability truth. |
| Auth, team, keys, onboarding | 18 | `/api/auth/login`, `/api/auth/register`, `/api/auth/invite`, `/api/auth/me`, `/api/users`, `/api/users/[userId]/api-keys`, `/api/onboarding/*` | Admin, operator, agent | Critical - access control and bootstrap. |
| Governance, audit, security, compliance | 18 | `/api/admin/compliance`, `/api/admin/vault`, `/api/audit`, `/api/audit-log`, `/api/escalations`, `/api/security/report`, `/api/dsar/*` | Admin, operator | Critical - auditability, privacy, and regulated controls. |
| Improve loops: APO, SEAL, evals, belief, classification | 17 | `/api/apo`, `/api/seal/*`, `/api/evals/*`, `/api/belief/*`, `/api/classification/*` | Operator, admin | High - self-improvement gates and human approval. |
| Operations, metrics, cache, health | 17 | `/api/activity`, `/api/operations/noc`, `/api/model-usage`, `/api/tokens`, `/api/time-series`, `/api/cache/*`, `/api/health`, `/api/heartbeat`, `/api/cron-health` | Operator, agent | Medium - observability and degraded-service transparency. |
| Knowledge/library/wiki/workspace | 13 | `/api/knowledge`, `/api/knowledge/trends`, `/api/library/freshness`, `/api/wiki`, `/api/wiki/digest`, `/api/workspace`, `/api/document-directory` | Operator, agent | Medium - corpus visibility and context assembly. |
| Agent runtime/context/observability | 12 | `/api/agent-context/*`, `/api/agent-memory/*`, `/api/agent-checkpoints`, `/api/agent-runtime/observability`, `/api/agent-peers` | Agent, operator | High - runtime handoffs, ACK/reply loops, trace capture. |
| Public/integration contracts | 12 | `/api/public/v1/openapi`, `/api/public/v1/traces`, `/api/chatgpt/actions/*`, `/api/integrations/slack/events`, `/api/meeting/join` | Agent, external integration | High - public contract compatibility and signature/token boundaries. |
| Model routing and policy | 8 | `/api/model-routing/*`, `/api/model-usage`, `/api/directives/*`, `/api/policy/knowledge`, `/api/ontology` | Operator, agent | Medium - cost/risk routing and policy outcomes. |
| Shared space, recall, native ingest, tool attention | 13 | `/api/shared-space`, `/api/space-cache/*`, `/api/recall/*`, `/api/native-memory/ingest`, `/api/tool-attention/*` | Agent, operator | Medium - collaboration memory and usage-derived suggestions. |
| Voice/engagement | 4 | `/api/chat`, `/api/tts`, `/api/voice-status`, `/api/engagement/test` | Operator, agent | Low/Medium - optional services should degrade cleanly. |

## Inventory: roles and expected boundaries

| Role | How represented | Expected access | Must not be able to |
| --- | --- | --- | --- |
| Admin | Human auth role `admin`; highest `ROLE_RANK` | All operator console read flows; team list and invites; compliance admin APIs; vault replay/list; API key self-management; operator write actions. | Bypass audit logging for sensitive changes; view a generated API key after the one-time reveal; use malformed invite tokens. |
| Operator | Human auth role `operator` | Authenticated console; operator-gated writes such as eval runs, SEAL writes, L3 polling, onboarding invite route; memory/skill/orchestration operations. | Create admin-only human invites through `/api/auth/invite`; access admin compliance/vault APIs; mutate another user's API keys. |
| Agent | API key, bearer token, signed invite token, route-local auth, or registered runtime actor depending on endpoint | Register or heartbeat where allowed; capture memory/handoff traces; search memory via allowed agent endpoints; use public v1 and ChatGPT action contracts; write telemetry/tool-attention events. | Access human-only console pages; perform admin/team/compliance actions; ingest or retrieve unauthorized/private memory; escalate permissions through local-auth exceptions. |
| Reviewer (supporting human role) | Human auth role `reviewer`; not requested as a UAT persona but present in code | Lowest human read/review behavior where proxy requires at least reviewer for generic app APIs. | Perform operator/admin writes. |

## Inventory: key workflows

| Workflow | Entry points | APIs under test | Primary persona | Pass condition |
| --- | --- | --- | --- | --- |
| Public discovery to login | `/`, `/platform`, `/use-cases/*`, `/vs/*`, `/blog/*`, `/login` | Public host proxy behavior, `/api/auth/login` | Prospect, admin/operator | Public pages render on marketing host; app-host protected pages redirect to login; valid login enters console. |
| Admin invite and registration | `/team`, `/invite/[token]`, `/register` | `/api/auth/invite`, `/api/auth/invite/[token]`, `/api/auth/register` | Admin, invitee | Invite is one-time, expires as documented, creates correct role, and fails safely when reused/invalid. |
| Operator onboarding invite | `/team` or operator API flow | `/api/onboarding/invite`, `/api/onboarding/script`, `/api/onboarding/register` | Operator, agent | Signed onboarding token produces script and registration; bad token returns forbidden-style failure without production access. |
| API key lifecycle | `/settings/api-keys` | `/api/auth/me`, `/api/users/[userId]/api-keys`, `/api/users/[userId]/api-keys/[keyId]` | Admin/operator/reviewer | Key is generated once, copied, listed without raw secret, revoked idempotently, and denied for other users. |
| Operations command center | `/`, `/ledger`, `/business-ops` | `/api/operations/noc`, `/api/activity`, `/api/model-usage`, `/api/tokens`, `/api/time-series` | Operator | Metrics load with fixture data and degraded optional services display as degraded rather than breaking page render. |
| Memory browse/search | `/notebooks`, `/library`, `/wiki` | `/api/memory`, `/api/memory/search`, `/api/memory/multi-search`, `/api/library/freshness`, `/api/wiki` | Operator, agent | Synthetic memories are visible/searchable only within allowed scope; empty and error states are clear. |
| Memory lifecycle compliance | `/settings/compliance`, API-only flows | `/api/memory-lifecycle/*`, `/api/dsar/*`, `/api/admin/compliance` | Admin, operator | Retention, legal hold, expiry, erasure, vault, and audit outputs are consistent and auditable. |
| Skill governance | `/cookbooks`, `/skills` | `/api/skills/*`, `/api/skillforge/*`, `/api/artifact-gate/*` | Operator, agent | Skills show readiness, risk, quarantine, pins, proposals, signatures, and sync results without dispatching incomplete contracts. |
| Agent registry and flow | `/agents`, `/flow` | `/api/agents/*`, `/api/a2a/*`, `/api/remote-agents`, `/api/hive` | Operator, agent | Registered agents show truthful cards/capabilities; version promote/rollback requires valid authorization and is visible in flow. |
| Dispatch and engagement | `/dispatch`, `/meetings` | `/api/dispatch`, `/api/chat`, `/api/meeting/join`, `/api/tts`, `/api/voice-status` | Operator, agent | Dispatch requests route correctly; optional voice/TTS failures do not block text-based workflow. |
| Improvement loop | `/apo`, `/seal`, `/evals`, `/agent-autogen`, `/memory-autogen` | `/api/apo`, `/api/seal/*`, `/api/evals/*`, `/api/belief/*`, `/api/classification/*` | Operator, admin | Proposals are reviewed, approved/rejected, audited, and evidence is retrievable; unsafe self-editing is gated. |
| Audit and escalation | `/audit`, `/escalations` | `/api/audit`, `/api/audit/export`, `/api/escalations/*`, `/api/audit-log` | Admin, operator | Sensitive actions create audit records; escalation resolution is traceable and rejects invalid IDs. |
| Public v1/API integrations | API docs/clients | `/api/public/v1/*`, `/api/chatgpt/actions/*`, `/api/integrations/slack/events` | Agent, external integration | OpenAPI output matches behavior; tokens/signatures are enforced; errors are stable and non-leaky. |

## Acceptance criteria and finite risk-based edge cases

### 1. Public marketing, SEO, and auth surfaces

Acceptance criteria:
- Public marketing host serves `/`, `/platform`, `/blog`, `/blog/[slug]`, `/use-cases`, `/use-cases/*`, `/vs`, and `/vs/[competitor]` without requiring app login.
- App host redirects protected UI pages to `/login` when no valid access token cookie is present.
- Login accepts valid seeded credentials, sets HttpOnly access/refresh cookies, and displays the authenticated user in the shell.
- Register/invite pages handle valid, expired, used, and malformed tokens with clear user-facing messages.
- Public pages include stable titles/canonical metadata and internal links resolve without client errors.

Finite edge cases:
1. Unknown blog slug and competitor slug return the app's expected not-found behavior without exposing stack traces.
2. Public host request for a non-marketing protected path redirects to `/` rather than exposing app content.
3. Invalid login body, missing email/password, and repeated bad credentials return safe messages and do not create sessions.
4. Invite token reuse fails after successful registration.
5. Shellless routes (`/login`, `/register`, `/invite/*`, `/understand`) do not render the operator sidebar.

### 2. Operator shell, navigation, and degraded health

Acceptance criteria:
- Sidebar exposes the eight consolidated groups: Operations, Workflow Map, Memory, Skills, Agents, Engage, Improve, Governance.
- Section tabs appear for Operations, Memory, Improve, and Governance grouped pages and highlight the active page.
- Top bar health and storage panic/degraded banners render from `/api/health` data without blocking page content.
- Mobile drawer opens/closes and route changes close it.

Finite edge cases:
1. Optional service degradation shows bounded banner text and no infinite loading state.
2. Direct URL to every route in the 35-page inventory renders or redirects according to auth/host rules.
3. Long page names, service names, or user email values truncate without horizontal overflow.
4. Invalid or expired access token redirects to `/login`.

### 3. Operations: NOC, ledger, and business ops

Acceptance criteria:
- NOC loads activity, anomaly, efficiency, and service-status panels from fixture/local data.
- Ledger surfaces token/model usage with totals and empty states.
- Business Ops/finance reconciliation shows either configured finance reconciliation or business outcome/L3 scoring based on runtime terms.
- Metrics endpoints return deterministic JSON for empty, small, and moderately large local datasets.

Finite edge cases:
1. Missing telemetry rows produce zero/empty-state cards, not `NaN`.
2. Large timestamp windows remain paginated or bounded.
3. Unknown model/provider names render as labels without breaking grouping.
4. Cache purge/prewarm failures are reported without losing existing stats.

### 4. Memory, library, wiki, recall, and lifecycle

Acceptance criteria:
- Synthetic memory fixtures can exercise browse, search, graph, multi-search, health, recall, and OKF export paths without real PII.
- Knowledge/library/wiki pages show freshness, trends, and digested content states.
- Lifecycle APIs record audit outputs for retention, expiry, decay, consolidation, DSAR, offboarding, legal holds, subject erasure, tombstones, vault, and graph catch-up.
- Authorization boundaries prevent anonymous or agent actors from retrieving private/unapproved memory.

Finite edge cases:
1. Search with no query or whitespace query returns a validation or empty response consistently.
2. Duplicate memory content is deduplicated or presented with distinct IDs according to API contract.
3. Legal hold blocks destructive erasure/expiry paths for held records.
4. DSAR export/delete handles nonexistent subject IDs safely.
5. Graph catch-up and vault endpoints tolerate empty stores.

### 5. Skills, cookbooks, SkillForge, and artifact gate

Acceptance criteria:
- `/skills` lists governed skills with completeness, missing fields, dispatch status, source harness, risk tier, owner, and suggestions.
- Incomplete, disabled, quarantined, or unsigned skills are not shown as dispatch-ready.
- Import, lifecycle, proposal approve/reject, pin rollback, sync, verify, sign, report, and quarantine flows preserve auditability.
- `/cookbooks` remains distinct from governed registry and surfaces filesystem-discovered skills/tool-attention suggestions.

Finite edge cases:
1. Unknown proposal/pin/quarantine IDs return 404-style responses without mutating state.
2. High/critical risk skill records display visibly and require the expected approval path.
3. Signature verification fails closed for missing or malformed key material.
4. Duplicate skill imports update or reject predictably without creating ambiguous dispatch entries.
5. SkillForge route-local auth cannot be used to bypass human admin/operator requirements elsewhere.

### 6. Agents, workflow map, dispatch, meetings, and agent runtime APIs

Acceptance criteria:
- Registered agents appear with truthful cards, protocol/platform metadata, versions, and capability boundaries.
- Agent register/heartbeat/checkpoint/context/message ACK/reply/handoff flows work with synthetic agents and API credentials.
- `/flow` visualizes registered agents and runtime relationships without crashing on missing optional metadata.
- Dispatch, meeting join, ChatGPT actions, public v1 traces/runs/proposals, and Slack event paths enforce their own token/signature/contract rules.

Finite edge cases:
1. Agent attempts to register with missing ID/name/protocol are rejected with validation errors.
2. Duplicate agent registration is idempotent or returns a clear conflict.
3. ACK/reply for missing agent-context message ID returns not found.
4. Dispatch request with invalid target agent fails without partial side effects.
5. Public v1 OpenAPI document stays accessible and matches representative endpoint responses.

### 7. Improve loop: APO, SEAL, evals, autogen, belief, and classification

Acceptance criteria:
- APO, SEAL, evals, agent-autogen, and memory-autogen pages load proposal/history/config data and expose clear approve/reject/run states.
- Operator-gated writes (`/api/evals/run`, SEAL writes, etc.) reject reviewer/agent actors and succeed for authorized operators/admins.
- SEAL job evidence and audit endpoints return stable, reviewable artifacts.
- Belief/classification review decisions are auditable and cannot be double-resolved inconsistently.

Finite edge cases:
1. Eval run with missing or invalid config returns validation errors and leaves previous config intact.
2. SEAL proposal approval for already-approved/rejected proposal is idempotent or returns conflict.
3. Evidence for unknown job ID returns not found.
4. Autogen proposal with unsafe content remains review-only and never auto-dispatches.

### 8. Governance: team, API keys, compliance, audit, escalations, security

Acceptance criteria:
- Admin can list users, generate invites for reviewer/operator/admin roles, and see roles/last-login data.
- Non-admin human users cannot list all users or create admin auth invites.
- Users can generate API keys, see the raw key exactly once, list masked metadata, and revoke keys.
- Compliance settings require admin role and write audit entries.
- Audit/export, vault, DSAR, security report, capability report, and escalation resolution paths produce traceable evidence.

Finite edge cases:
1. API key label can be empty or long without breaking display; raw key is not returned in list calls.
2. Revoking an already-revoked or unknown key fails safely.
3. Compliance update with invalid retention days or adapter list is rejected or normalized predictably.
4. Escalation resolution for already-resolved ID is conflict/idempotent and audited.
5. Admin vault list/replay rejects non-admin roles and invalid artifact IDs.

## Sanitized local data approach

Use `node scripts/seed-sanitized-local-data.mjs` to generate deterministic fake fixtures under:

```text
apps/memroos/data/uat-fixtures/
```

The repository already ignores `/apps/memroos/data/`, so fixture files are local-only and should not be committed. The fixture pack is JSON-only and does not connect to production services, databases, network APIs, or real user content. It contains:
- Synthetic users with `example.test` emails and roles for admin/operator/reviewer.
- Synthetic agent identities, cards, API-key metadata, checkpoints, and runtime messages.
- Synthetic memories, wiki/library items, skills, proposals, audits, escalations, eval summaries, lifecycle records, and operations metrics.

Recommended UAT use:
1. Run the seed script before local/manual UAT.
2. Import or adapt JSON fixtures into local SQLite/API setup only if the tested flow requires database-backed state.
3. Keep all exploratory UAT notes and screenshots free of real customer/user data.
4. Reset by re-running the seed script; output is deterministic and idempotent.
