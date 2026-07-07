You are a MiniMax-M3 WORKER on the memroos repo. Branch: v8.2-team-scale-access-policy-plane (already checked out; edit the working tree in place, do NOT switch branches, do NOT commit). CWD: /Users/lcalderon/github/memroos.

# TASK: Implement Phase 131 - Identity Lifecycle + Delegation Chains (TEAMSCALE-02..06)

## HARD CONSTRAINT
Do NOT modify `authorizeMemoryUse`, `checkDispatchPolicy`, `checkA2aSendPolicy`, `checkMemoryWritePolicy` internals. Do NOT edit `security-regression.test.ts`. Do NOT break existing tests. Do NOT commit or change git branch.

## EXISTING SURFACES (read them first)
- `apps/memroos/src/lib/agent-registry.ts` — READ. Exports: registerAgent (returns {agent, apiKey}), deregisterAgent, createAgentApiKey, listRegisteredAgents, getRegisteredAgent. Uses getDb() internally. RegisterAgentInput has: id?, name, role, platform, protocol, capabilities?, skills?, metadata?.
- `apps/memroos/src/lib/space.ts` — Phase 130. Exports: createSpace, addSpaceMember, getSpacesForUser, isSpaceMember, filterBySpace. Uses db param.
- `apps/memroos/src/lib/db-schema.ts` — has users, user_roles, user_api_keys, user_refresh_tokens, agents, spaces, space_members tables. READ the file to understand the schema (column names, types, constraints).
- `apps/memroos/src/lib/noc-filters.ts` — NocFilters interface, nocWindowToTimeSeriesWindow, nocWindowToSinceIso.
- `apps/memroos/src/lib/policy/engine.ts` — Phase 128/129: evaluatePolicy, PolicyRequest with dimensions.
- `apps/memroos/src/lib/audit/write.ts` — writeAuditEntry(entry, db).
- `apps/memroos/src/lib/audit/event-types.ts` — AUDIT_EVENT_TYPES, ENTITY_TYPES, ACTOR_ROLES.
- `apps/memroos/src/lib/__tests__/db.test.ts` — READ for test patterns (in-memory DB, initSchema).
- `apps/memroos/src/lib/space.ts` — READ for how functions accept db param.

## FILES TO CREATE

### 1. apps/memroos/src/lib/identity/lifecycle.ts
```ts
import type Database from "better-sqlite3";
import crypto from "crypto";

export interface OnboardingReceipt {
  userId: string;
  agentId: string;
  agentApiKey: string;
  spaceIds: string[];
  role: string;
  skills: string[];
  createdAt: string;
}

export interface OffboardingReceipt {
  userId: string;
  revokedApiKeys: number;
  revokedRefreshTokens: number;
  deregisteredAgents: number;
  reassignedArtifacts: number;
  meMlifeReviewItemId: string;
  createdAt: string;
}

export interface OrphanedAgent {
  agentId: string;
  agentName: string;
  ownerId: string | null;
  hasLiveKey: boolean;
}

// Atomic joiner: create user + role + space memberships + agent + key in one transaction
export function onboardUser(db: Database.Database, input: {
  email: string;
  displayName: string;
  role: "admin" | "operator" | "reviewer";
  spaceIds: string[];
  agentKit: { name: string; platform?: string; skills?: string[]; capabilities?: Array<{ id: string; name?: string; description?: string }> };
}): OnboardingReceipt;

// Atomic leaver: revoke credentials + deregister agents + reassign artifacts + open MEMLIFE review
export function offboardUser(db: Database.Database, userId: string): OffboardingReceipt;

// Scan for orphaned agents (live keys, owner revoked/deleted)
export function scanOrphanedAgents(db: Database.Database): OrphanedAgent[];
```

Implementation details:
- `onboardUser`: use `db.transaction(() => {...})()` for atomicity. Generate UUIDs for user id and agent id. Insert into users table (email, display_name, password_hash = temporary, tenant_id = 'default-tenant'). Insert into user_roles. For each spaceId, insert into space_members (member_type='human'). Register agent by inserting into agents table directly (don't call registerAgent which uses getDb() — use the passed db). Create agent API key by inserting into agent_api_keys or similar (check agent-registry.ts for the table name). Write an audit row. Return the receipt.
- `offboardUser`: use `db.transaction(() => {...})()`. Revoke user_api_keys (set revoked_at). Revoke user_refresh_tokens (set revoked_at). Find agents owned by this user (check agents table for owner_id or metadata) and deregister them (delete or set status). Reassign artifacts (update messages or other tables' owner fields to null). Create a MEMLIFE review item (insert into hil_escalations with escalation_type 'meMlife_erasure_review'). Write audit rows. Return receipt.
- `scanOrphanedAgents`: query agents with live API keys (not revoked) where the owner user is revoked or doesn't exist. Return the list.

### 2. apps/memroos/src/lib/identity/delegation.ts
```ts
export interface DelegationHop {
  fromId: string;
  fromType: "user" | "agent";
  toId: string;
  toType: "agent" | "sub-agent";
  capabilities: string[];
}

export interface DelegationChain {
  user: { id: string; role: string };
  agent: { id: string; capabilities: string[] };
  subAgent?: { id: string; capabilities: string[] };
  hops: DelegationHop[];
}

// Build chain from DB records
export function buildDelegationChain(db: Database.Database, userId: string, agentId: string, subAgentId?: string): DelegationChain;

// Verify each hop is valid (agent belongs to user, sub-agent delegated by agent)
export function verifyDelegationChain(chain: DelegationChain): { valid: boolean; reason?: string };

// Policy evaluates weakest link: if any hop denies, chain denies
export function weakestLinkOutcome(chain: DelegationChain, hopOutcomes: Array<{ hopIndex: number; outcome: "allow" | "deny" }>): "allow" | "deny";
```

### 3. apps/memroos/src/lib/identity/noc-views.ts
```ts
import type Database from "better-sqlite3";

export interface TeamNocView {
  spaceId: string;
  spaceName: string;
  window: string;
  memoryGrowth: { count: number; trend: "up" | "down" | "flat" };
  promotionQueueDepth: number;
  policyDenials: number;
  skillUsage: Array<{ skillId: string; count: number }>;
  agentActivity: { activeAgents: number; totalHeartbeats: number };
}

export function getTeamNocView(db: Database.Database, input: { spaceId: string; window?: string }): TeamNocView;
```
Implementation: query messages count for the space in the time window, count belief_promotion_decisions or hil_escalations with status open, count audit_entries with event_type='policy.decision' and outcome='deny', aggregate skill reports from agent_skill_reports or similar, count agent heartbeats. Use the noc-filters helpers for time window.

### 4. apps/memroos/src/lib/identity/owner-gate.ts
```ts
import type Database from "better-sqlite3";

export interface OwnerGate {
  assetType: string;
  assetId: string;
  ownerId: string;
  approvalMode: "standing" | "per-use";
}

export interface OwnerGateDecision {
  allowed: boolean;
  reason: string;
  approvalMode: "standing" | "per-use" | "none";
}

// Check if owner has standing approval or has granted per-use approval
export function checkOwnerGate(db: Database.Database, input: {
  assetType: string;
  assetId: string;
  requestingAgentId: string;
  ownerId: string;
}): OwnerGateDecision;

// Owner grants standing approval for all future uses
export function grantStandingApproval(db: Database.Database, input: {
  ownerId: string;
  assetType: string;
  assetId: string;
}): void;

// Owner grants per-use approval for a specific agent
export function grantPerUseApproval(db: Database.Database, input: {
  ownerId: string;
  assetType: string;
  assetId: string;
  agentId: string;
}): void;
```
Implementation: store approvals in a new `owner_gate_approvals` table (owner_id, asset_type, asset_id, approval_mode, agent_id nullable, created_at, revoked_at nullable). checkOwnerGate: first check standing approval (not revoked), then check per-use for the specific agent. Write audit rows for gate decisions.

### 5-8. Tests
Create test files under `apps/memroos/src/lib/identity/__tests__/`:
- `lifecycle.test.ts`: onboardUser creates user+role+space+agent+key atomically with receipt; offboardUser revokes everything atomically; scanOrphanedAgents returns zero after offboard, non-zero for orphaned.
- `delegation.test.ts`: buildDelegationChain constructs chain; verifyDelegationChain validates; weakestLinkOutcome returns deny if any hop denies, allow if all allow.
- `noc-views.test.ts`: getTeamNocView returns counts for memory, denials, skills, agents.
- `owner-gate.test.ts`: standing approval allows; per-use approval allows only for the specific agent; no approval denies; grant functions work.

Use the same test patterns as `space.test.ts` (in-memory DB, initSchema, beforeEach).

## DO NOT
- Do NOT edit `security-regression.test.ts` or the wrapped function internals.
- Do NOT add any npm dependency.
- Do NOT commit or change git branch.

## VERIFY BEFORE YOU FINISH (run these, paste output)
```
cd /Users/lcalderon/github/memroos/apps/memroos && npx vitest run src/lib/identity src/lib/policy src/lib/memory/__tests__/security-regression.test.ts 2>&1 | tail -25
cd /Users/lcalderon/github/memroos/apps/memroos && npx tsc --noEmit 2>&1 | grep -E "src/lib/identity" | head -10 ; echo "IDENTITY-TSC-DONE"
```
All identity tests + policy tests + MEMSEC-08 MUST pass, zero tsc errors under src/lib/identity. Then STOP and report: files created, test counts, and the exact verify output.
