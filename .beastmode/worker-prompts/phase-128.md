You are a MiniMax-M3 WORKER on the memroos repo. Branch: v8.2-team-scale-access-policy-plane (already checked out; edit the working tree in place, do NOT switch branches, do NOT commit). CWD: /Users/lcalderon/github/memroos.

# TASK: Implement Phase 128 - Policy Engine Core + Decision Receipts (POLGOV-01/02)

## HARD CONSTRAINT (do not violate)
This is WRAP-NOT-REWRITE. Decisions MUST be BYTE-IDENTICAL to today on the MEMSEC-08 regression corpus. Do NOT change the internal logic of `authorizeMemoryUse`, `checkDispatchPolicy`, `checkA2aSendPolicy`, or `checkMemoryWritePolicy`. The engine DELEGATES to these existing functions and adds versioning + receipts around them. Never change a decision outcome.

## EXISTING SURFACES (already verified - read them first)
- apps/memroos/src/lib/memory/policy-gate.ts
  - `authorizeMemoryUse({actor, purpose, label}) => {decision: "allow"|"deny"|"redact"|"review-required", reason, label}`
  - `filterAuthorizedMessageRows(db, rows, actor, purpose)` and `filterAuthorizedMemoryItems(db, items, actor, purpose, labelForItem, targetForItem?)` - these call authorizeMemoryUse then `auditDecision` (writeAuditLog).
  - Types exported: MemoryUseActor, MemoryUsePurpose, MemoryLabelSnapshot, MemoryUseDecisionResult.
- apps/memroos/src/lib/security-policy.ts
  - `checkDispatchPolicy(fromAgentId, targetAgent) => PolicyDecision`
  - `checkA2aSendPolicy(agent) => PolicyDecision`
  - `checkMemoryWritePolicy(agent, tier) => PolicyDecision`
  - `PolicyDecision = {allowed: boolean, code?: "MISSING_CAPABILITY"|"NETWORK_POLICY_DENIED", message?, detail?}`
- apps/memroos/src/lib/audit/event-types.ts
  - ALREADY has `AUDIT_EVENT_TYPES.POLICY_DECISION = "policy.decision"` and `ENTITY_TYPES.POLICY_DECISION = "policy_decision"` (added by Director - use them, do not re-add).
  - ACTOR_ROLES = {ADMIN:"admin", OPERATOR:"operator", REVIEWER:"reviewer", SYSTEM:"system"}.
- apps/memroos/src/lib/audit/write.ts
  - `writeAuditEntry(entry: NewAuditEntry, db?)` inserts into the closed-enum append-only `audit_entries` table. NewAuditEntry fields: id?, tenant_id?, actor_id, actor_role, event_type, entity_type, entity_id, reason?, metadata_json (string|object), created_at?.
- apps/memroos/src/lib/memory/__tests__/security-regression.test.ts - the MEMSEC-08 corpus. MUST stay green byte-identical. READ IT, do not edit it.

## FILES TO CREATE

### 1. apps/memroos/src/lib/policy/policies/manifest.json
Versioned, in-repo, git-tracked declarative policy manifest. Zero external deps. Shape:
```json
{
  "version": "2026.07.128",
  "rules": [
    {"id": "memsec.memory-use", "domain": "memory-use", "description": "MEMSEC label-based memory use gate (sealed/private/review/redact)", "implementation": "memory-gate.authorizeMemoryUse"},
    {"id": "capability.dispatch", "domain": "capability", "description": "A2A dispatch target must declare dispatch capability and pass network policy", "implementation": "security-policy.checkDispatchPolicy"},
    {"id": "capability.a2a-send", "domain": "capability", "description": "Caller must declare A2A send capability", "implementation": "security-policy.checkA2aSendPolicy"},
    {"id": "capability.memory-write", "domain": "capability", "description": "Agent must declare capability to write the given memory tier", "implementation": "security-policy.checkMemoryWritePolicy"},
    {"id": "knowledge.policy-check", "domain": "knowledge", "description": "Knowledge storage policy compliance for a tool use", "implementation": "knowledge.knowledge_policy_check"}
  ]
}
```

### 2. apps/memroos/src/lib/policy/receipt.ts
Export:
```ts
export interface PolicyReceipt {
  policyVersion: string;
  domain: "memory-use" | "capability" | "knowledge";
  action: string;
  ruleMatched: string;              // rule id from manifest
  outcome: "allow" | "deny" | "redact" | "review-required";
  reason: string;                   // SAFE reason only, never withheld content
  detail?: Record<string, unknown>; // ids/labels/codes only, NEVER payload bodies/content
  actorId: string;
  actorRole: "admin" | "operator" | "reviewer" | "system";
  tenantId: string;
  createdAt: string;
}
```
- `export function emitPolicyReceipt(db, receipt: PolicyReceipt): void` - writes an audit row via `writeAuditEntry` with event_type = AUDIT_EVENT_TYPES.POLICY_DECISION, entity_type = ENTITY_TYPES.POLICY_DECISION, entity_id = `policy_decision:${receipt.domain}:${receipt.action}`, actor_id = receipt.actorId, actor_role = receipt.actorRole, reason = receipt.reason, metadata_json = JSON of {policyVersion, domain, action, ruleMatched, outcome, reason, detail}. tenant_id = receipt.tenantId.
- IMPORTANT: emitPolicyReceipt must be best-effort and MUST NOT throw into the decision path. Wrap the write in try/catch; on failure, swallow (a receipt write failure must never change or block a decision). This preserves byte-identical behavior.

### 3. apps/memroos/src/lib/policy/engine.ts
Load manifest.json (import it). Export:
```ts
export const POLICY_VERSION: string;   // from manifest
export type PolicyDomain = "memory-use" | "capability" | "knowledge";
export interface PolicyRequest {
  domain: PolicyDomain;
  action: string;
  actor?: { id: string; role: "admin"|"operator"|"reviewer"|"agent"|"anonymous"|"system"; tenantId?: string|null };
  memoryUse?: { actor: MemoryUseActor; purpose: MemoryUsePurpose; label: MemoryLabelSnapshot };
  capability?:
    | { kind: "dispatch"; fromAgentId: string; targetAgent: RemoteAgentConfig }
    | { kind: "a2a-send"; agent: RegisteredAgent }
    | { kind: "memory-write"; agent: RegisteredAgent; tier: MemoryTier };
}
export interface PolicyEvaluation {
  receipt: PolicyReceipt;
  // pass through the raw underlying result so callers keep byte-identical behavior:
  memoryUse?: MemoryUseDecisionResult;
  capability?: PolicyDecision;
}
export function evaluatePolicy(req: PolicyRequest, db?: Database.Database): PolicyEvaluation;
```
Behavior:
- domain "memory-use": call `authorizeMemoryUse(req.memoryUse)`. Map result.decision -> receipt.outcome (identical string). ruleMatched = "memsec.memory-use". reason = result.reason. detail = { label: result.label, purpose, actorRole }. Return { receipt, memoryUse: result }.
- domain "capability": call the matching security-policy fn by kind. Map PolicyDecision.allowed -> outcome "allow" (true) or "deny" (false). ruleMatched = "capability.dispatch"|"capability.a2a-send"|"capability.memory-write". reason = decision.message ?? (allowed ? "capability_allowed" : decision.code ?? "capability_denied"). detail = decision.detail (ids/codes only - it already is). Return { receipt, capability: decision }.
- domain "knowledge": this is a thin declarative pass-through in THIS phase (the actual knowledge_policy_check lives in the MCP server, Python). Provide `evaluateKnowledgePolicy(action, metadata, actor)` that returns outcome "allow" with reason "knowledge_policy_delegated" and ruleMatched "knowledge.policy-check" - it records a receipt that the knowledge decision was evaluated through the engine. Do NOT reimplement the Python check. Keep it minimal.
- Always build a PolicyReceipt with POLICY_VERSION, and if a db is passed, call emitPolicyReceipt(db, receipt) (best-effort). actorId/actorRole/tenantId derived from req.actor (fallback actorId "system", actorRole "system", tenantId "default-tenant"; map role "agent"/"anonymous" -> actor_role "system" for the audit row since audit_entries actor_role enum is admin|operator|reviewer|system).

### 4 & 5. Tests
- apps/memroos/src/lib/policy/__tests__/engine.test.ts (vitest, `// @vitest-environment node`, use `new Database(":memory:")` + `initSchema` from "@/lib/db-schema"):
  - memory-use: evaluatePolicy for a sealed label returns receipt.outcome === "deny" AND matches authorizeMemoryUse directly (byte-identical: deep-equal evaluation.memoryUse to authorizeMemoryUse(sameInput)).
  - capability dispatch: a target with no dispatch skills in production profile returns outcome "deny" with ruleMatched "capability.dispatch" and evaluation.capability equals checkDispatchPolicy(sameInput).
  - receipt carries policyVersion === POLICY_VERSION and reason present, and detail contains NO content field.
  - passing a db writes exactly one POLICY_DECISION audit row (query audit_entries WHERE event_type='policy.decision').
- apps/memroos/src/lib/policy/__tests__/receipt.test.ts:
  - emitPolicyReceipt writes a row with correct event_type/entity_type/actor_role and metadata_json round-trips.
  - emitPolicyReceipt swallows errors (pass a broken db-like object / or force a throw) and does NOT throw.

## DO NOT
- Do NOT edit security-regression.test.ts.
- Do NOT change decision logic in policy-gate.ts or security-policy.ts internals. (You MAY leave those files untouched entirely for this phase - the engine wraps them by import. Preferred: leave them untouched.)
- Do NOT add any npm dependency. Do NOT add OPA/Cedar. In-repo TS + JSON only.
- Do NOT commit or change git branch.

## VERIFY BEFORE YOU FINISH (run these, paste output)
```
cd /Users/lcalderon/github/memroos/apps/memroos && npx vitest run src/lib/policy src/lib/memory/__tests__/security-regression.test.ts 2>&1 | tail -25
cd /Users/lcalderon/github/memroos/apps/memroos && npx tsc --noEmit 2>&1 | grep -E "src/lib/policy" | head -20 ; echo "POLICY-TSC-DONE"
```
All policy tests + the MEMSEC-08 suite MUST pass, and there must be ZERO tsc errors under src/lib/policy. Then STOP and report: files created, test counts, and the exact verify output.
