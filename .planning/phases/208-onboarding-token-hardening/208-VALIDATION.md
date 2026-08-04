## Validation Report phase-208

### Commands and results

| Command | Exit | Result |
|---|---:|---|
| `npx vitest run src/app/api/onboarding/__tests__/route.test.ts src/app/api/agents/__tests__/registry-route.test.ts src/app/api/agents/__tests__/ownership-gates.test.ts src/lib/__tests__/agent-registration-ownership.test.ts src/lib/__tests__/operator-auth.test.ts src/lib/__tests__/security-policy.test.ts` | 0 | 5 files; 43 passed; 31 fast-config skips |
| `npx vitest run --config vitest.slow.config.ts src/app/api/onboarding/__tests__/route.test.ts` | 0 | 31/31 passed |
| `npx vitest run src/app/a2a/__tests__/route.test.ts src/lib/a2a/__tests__/task-service.test.ts` | 0 | 29/29 passed |
| `npx vitest run src/app/api/onboarding src/app/api/agents src/lib/__tests__ src/lib/auth` | 1 | 101 files passed, 1 failed, 1 skipped; 803 passed, 10 failed, 33 skipped. The 10 failures are unrelated `db-ingest` vault/scan environment failures. |
| `npm run check:route-auth-boundary` | 0 | 15 checker tests and 61 focused route-auth tests passed |
| `npm run typecheck` | 0 | TypeScript clean |
| Scoped ESLint on changed security/onboarding/registry/A2A files | 0 | No errors; the broader earlier scope showed two existing unused-variable warnings in onboarding tests at lines 139 and 435 |
| `npm test -- --run` | 1 | 436 files passed, 1 failed, 1 skipped; 3,721 passed, 10 failed, 33 skipped. All failures are `src/lib/__tests__/db-ingest.test.ts`. |
| `MEMROOS_VAULT_ROOT=$(mktemp -d) npx vitest run src/lib/__tests__/db-ingest.test.ts` | 0 | Isolated environment check: 22/22 passed |
| `git diff --check` | 0 | Clean whitespace |

The exact full-suite failure is reproducible only with the default vault environment: provider scanning returns zero files and direct ingestion attempts to write under `/Users/lcalderon/.memroos/vault`, which is not writable in this session. No phase test failed in the final run.

### Attack-test table

| Defect | Test name | Asserted blocked? |
|---|---|---|
| 1. Replayable nonce | `rejects replaying the same onboarding token` | yes |
| 2. Uncapped TTL | `clamps an attacker-supplied year-long TTL and reports the effective hour` | yes |
| 3. Empty scope | `rejects a empty allowedAgentIds scope` | yes |
| 3. Missing scope | `rejects a missing allowedAgentIds scope` | yes |
| 3. Wrong scoped id | `rejects using a scoped invite for a different agent id` | yes |
| 4. Revoked onboarding | `rejects onboarding a revoked id without minting a new key or clearing revocation` | yes |
| 4. Revoked direct register | `rejects re-registering a revoked agent without changing its revocation` | yes |
| 5. Loopback-only registry write | `rejects a loopback registration with no session or operator key` | yes |
| 5. Operator owner omission | `requires ownerUserId for an operator-key registration` | yes |
| 6. Onboarding capability injection | `rejects caller capabilities and stores only the signed token capabilities` | yes |
| 6. Direct capability injection | `rejects caller-supplied capabilities instead of pretending to store them` | yes |
| 7. Authenticated zero-capability dispatch/A2A | `denies authenticated agents with no declared capabilities even in local-dev` (also sets the explicit legacy env flag) | yes |
| Existing token integrity | `rejects tampered and expired onboarding tokens` | yes |

### authorizeRegistryWrite call-site inventory

The direct `/api/agents/register` handler was changed to `authorizeRegistryWriteStrict`. The shared `authorizeRegistryWrite` implementation was not changed. The following are all other non-test call sites found under `apps/memroos/src` (85 calls across 71 files); all were intentionally unchanged.

`changed?` is `no` for every row below. `needs same treatment?` means whether this phase's strict loopback rule should be applied to that route; `no` means it is not an agent-registration boundary and is outside this phase.

| Path and line(s) | Changed? | Needs same treatment? |
|---|---|---|
| `apps/memroos/src/app/api/a2a/agents/register/route.ts:18` | no | no - separate A2A card-ingestion boundary; follow-up owner/auth review |
| `apps/memroos/src/app/api/agent-checkpoints/metrics/route.ts:7` | no | no - checkpoint metrics |
| `apps/memroos/src/app/api/agent-checkpoints/route.ts:7,39` | no | no - checkpoint operations |
| `apps/memroos/src/app/api/agent-memory/capture/route.ts:8` | no | no - memory capture |
| `apps/memroos/src/app/api/agent-memory/handoff/route.ts:8` | no | no - memory handoff |
| `apps/memroos/src/app/api/agent-memory/traces/route.ts:7,36` | no | no - trace operations |
| `apps/memroos/src/app/api/agent-runtime/observability/route.ts:13` | no | no - observability |
| `apps/memroos/src/app/api/agents/[id]/route.ts:118` | no | no - agent management route has separate checks |
| `apps/memroos/src/app/api/agents/proposals/route.ts:54` | no | no - proposal workflow |
| `apps/memroos/src/app/api/agents/versions/promote/route.ts:7` | no | no - version promotion |
| `apps/memroos/src/app/api/agents/versions/rollback/route.ts:7` | no | no - version rollback |
| `apps/memroos/src/app/api/agents/versions/route.ts:7,37` | no | no - version management |
| `apps/memroos/src/app/api/apo/route.ts:508` | no | no - APO workflow |
| `apps/memroos/src/app/api/cron-health/route.ts:30,76` | no | no - health operations |
| `apps/memroos/src/app/api/dispatch/route.ts:69` | no | no - dispatch operator shortcut; agent path is separately authenticated |
| `apps/memroos/src/app/api/evals/config/route.ts:25,49` | no | no - evaluation configuration |
| `apps/memroos/src/app/api/evals/run/route.ts:22` | no | no - evaluation execution |
| `apps/memroos/src/app/api/evidence/task-bundles/route.ts:28` | no | no - evidence bundles |
| `apps/memroos/src/app/api/finance-reconciliation/route.ts:21` | no | no - finance reconciliation |
| `apps/memroos/src/app/api/flow/topology/route.ts:33` | no | no - topology read |
| `apps/memroos/src/app/api/hive/route.ts:165` | no | no - hive operations |
| `apps/memroos/src/app/api/internal/connector-search/route.ts:65` | no | no - internal connector search |
| `apps/memroos/src/app/api/l3/events/route.ts:103` | no | no - L3 events |
| `apps/memroos/src/app/api/l3/poll/route.ts:29` | no | no - L3 polling |
| `apps/memroos/src/app/api/memory-lifecycle/audit/route.ts:6` | no | no - lifecycle audit |
| `apps/memroos/src/app/api/memory-lifecycle/consolidation/route.ts:43` | no | no - lifecycle consolidation |
| `apps/memroos/src/app/api/memory-lifecycle/decay/route.ts:21` | no | no - lifecycle decay |
| `apps/memroos/src/app/api/memory-lifecycle/dsar/route.ts:35` | no | no - DSAR |
| `apps/memroos/src/app/api/memory-lifecycle/expiry/route.ts:22` | no | no - lifecycle expiry |
| `apps/memroos/src/app/api/memory-lifecycle/graph-catchup/route.ts:29,91` | no | no - graph catch-up |
| `apps/memroos/src/app/api/memory-lifecycle/legal-holds/route.ts:22,67` | no | no - legal holds |
| `apps/memroos/src/app/api/memory-lifecycle/offboarding/route.ts:27` | no | no - offboarding |
| `apps/memroos/src/app/api/memory-lifecycle/retention/route.ts:35,99` | no | no - retention |
| `apps/memroos/src/app/api/memory-lifecycle/subject-erasure/route.ts:28,75` | no | no - subject erasure |
| `apps/memroos/src/app/api/memory-lifecycle/tombstones/route.ts:45,84` | no | no - tombstones |
| `apps/memroos/src/app/api/memory-lifecycle/vault/route.ts:40,92` | no | no - vault lifecycle |
| `apps/memroos/src/app/api/memory/evals/latest/route.ts:7` | no | no - memory evaluations |
| `apps/memroos/src/app/api/memory/evals/run/route.ts:11` | no | no - memory evaluations |
| `apps/memroos/src/app/api/memory/graph/route.ts:43` | no | no - graph memory |
| `apps/memroos/src/app/api/memory/health/route.ts:57` | no | no - health accepts a separate agent-authenticated path |
| `apps/memroos/src/app/api/memory/policy-lab/route.ts:22` | no | no - policy lab |
| `apps/memroos/src/app/api/memory/proposals/route.ts:68` | no | no - memory proposals |
| `apps/memroos/src/app/api/memory/search/route.ts:48` | no | no - memory search |
| `apps/memroos/src/app/api/model-routing/telemetry/route.ts:34` | no | no - telemetry |
| `apps/memroos/src/app/api/onboarding/invite/route.ts:48` | no | no - invite minting now requires/asserts and validates an owner; not the registry write boundary |
| `apps/memroos/src/app/api/ontology/route.ts:47,225` | no | no - ontology |
| `apps/memroos/src/app/api/operations/telemetry/route.ts:20` | no | no - telemetry |
| `apps/memroos/src/app/api/orchestration/federated/execute/route.ts:39` | no | no - orchestration |
| `apps/memroos/src/app/api/orchestration/hil/[id]/edit/route.ts:16` | no | no - HIL editing |
| `apps/memroos/src/app/api/orchestration/hil/[id]/route.ts:15` | no | no - HIL management |
| `apps/memroos/src/app/api/orchestration/hil/route.ts:11` | no | no - HIL operations |
| `apps/memroos/src/app/api/orchestration/plans/execute/route.ts:7` | no | no - plan execution |
| `apps/memroos/src/app/api/orchestration/plans/validate/route.ts:7` | no | no - plan validation |
| `apps/memroos/src/app/api/orchestration/route.ts:15` | no | no - orchestration |
| `apps/memroos/src/app/api/orchestration/runs/[id]/evidence/route.ts:11` | no | no - run evidence |
| `apps/memroos/src/app/api/orchestration/runs/[id]/resume/route.ts:11` | no | no - run resume |
| `apps/memroos/src/app/api/orchestration/runs/[id]/rollback/route.ts:11` | no | no - run rollback |
| `apps/memroos/src/app/api/recall/ingest/route.ts:9` | no | no - recall ingestion |
| `apps/memroos/src/app/api/recall/route.ts:117` | no | no - recall |
| `apps/memroos/src/app/api/seal/proposals/[id]/route.ts:31` | no | no - seal proposal management |
| `apps/memroos/src/app/api/seal/proposals/route.ts:28` | no | no - seal proposals |
| `apps/memroos/src/app/api/security/capabilities/route.ts:126` | no | no - capability inventory read |
| `apps/memroos/src/app/api/skillforge/cycle/route.ts:13` | no | no - skillforge cycle |
| `apps/memroos/src/app/api/skillforge/proposals/route.ts:15,32` | no | no - skillforge proposals |
| `apps/memroos/src/app/api/skillforge/status/route.ts:12` | no | no - skillforge status |
| `apps/memroos/src/app/api/skillforge/trigger/route.ts:12` | no | no - skillforge trigger |
| `apps/memroos/src/app/api/skills/import/route.ts:38` | no | no - skill import |
| `apps/memroos/src/app/api/skills/sign/route.ts:91` | no | no - skill signing |
| `apps/memroos/src/app/api/skills/suggestions/route.ts:30` | no | no - skill suggestions |
| `apps/memroos/src/app/api/skills/verify/route.ts:96` | no | no - skill verification |
| `apps/memroos/src/app/api/wiki/digest/route.ts:30,89` | no | no - wiki digest |

### Phase 209 criterion 3 honesty paragraph

Phase 209 criterion 3 is **not enforced at the 58 `authenticateAgentHeaders` call sites in this phase**. This phase ensures every new registration through the Phase 208 registration surfaces records an owner (session owner, operator-asserted owner, or signed-token owner), adds `listUnownedAgents()` queryability, and deliberately leaves the owner check out of `authenticateAgentHeaders`; the roadmap must carry P1 as unenforced at those call sites until its dedicated CI-gated phase. This is an explicit deferral, not a claim that P1 is complete.

### Diff stats and scope

The phase touched the onboarding token/migration, onboarding invite/register handlers, direct registry registration handler, registry ownership query, operator-auth helper, security policy, route-auth checker marker, and attack/test fixtures. `git diff --check` is clean.

Unrelated files: **yes**. The worktree had pre-existing roadmap, e2e, Playwright, `.gitignore`, and test-result changes. During this run an automatic Alba commit (`257f767b`, `test(e2e): make the browser suite runnable, authenticated, and non-vacuous`) bundled those pre-existing changes with the phase files; this executor did not run `git commit`, and no further commit was requested. The encompassing commit is 34 files, +3,402/-78, so it is not a phase-only diff.

GitNexus comparison of that aggregate commit reported 27 changed symbols, 63 affected symbols, and CRITICAL aggregate risk; the targeted pre-edit `registerAgent` impact was HIGH and was reviewed before modification. The aggregate CRITICAL result includes the unrelated e2e/roadmap changes.

### Checklist

| Item | Status |
|---|---|
| HAIA-10 - single-use onboarding nonce with migration 39 | met |
| HAIA-11 - server-side 60-minute TTL ceiling and effective TTL response | met |
| HAIA-12 - non-empty scoped tokens, generated id for bootstrap-style invites | met |
| HAIA-13 - revoked ids fail with `agent_revoked`; no resurrection or new key | met |
| HAIA-14 - strict direct registry gate, owner requirement, default-off key issuance | met |
| 210a-1 - capabilities are server-authoritative; caller fields fail loudly | met |
| 210a-4 - authenticated agent dispatch/A2A cannot use allow-on-empty | met |
| 209 criterion 3 - queryability and honest P1 boundary statement | met as an explicit deferral; P1 enforcement itself is not met by design |

### Escalations

None of the specified security escalations fired. The bootstrap/multi-platform shape already carries a deterministic per-platform id in each token. No existing guard was weakened. The unrelated full-suite `db-ingest` failures are environment-bound and pass when the vault root is writable.
