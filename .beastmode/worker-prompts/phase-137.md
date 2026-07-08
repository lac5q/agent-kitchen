You are a MiniMax-M3 WORKER on the memroos repo. Branch: v8.4-project-centric-operator-ux (already checked out; edit the working tree in place, do NOT switch branches, do NOT commit). CWD: /Users/lcalderon/github/memroos.

# TASK: Implement Phase 137 - Single-Load Workspace + Auto Context Packet (WORKLOAD-01..05)

## HARD CONSTRAINT
Do NOT modify `authorizeMemoryUse`, `checkDispatchPolicy`, `checkA2aSendPolicy`, `checkMemoryWritePolicy` internals. Do NOT edit `security-regression.test.ts`. Do NOT break existing tests. Do NOT commit or change git branch.

## EXISTING SURFACES (read them first)
- `apps/memroos/src/lib/agent-context-packet.ts` — READ. Exports: AgentContextPacket (has scope.project/client, actor, goal, constraints, memories, receipts), AgentRunLedger (has events with id/actor/actionType/...), buildAgentContextPacket(input: BuildAgentContextPacketInput), readAgentRunLedger(goalId). READ to understand the input shape for buildAgentContextPacket and how run ledger events are structured.
- `apps/memroos/src/lib/space.ts` — Phase 130. Exports: Space interface (id, tenantId, name, defaultLabels, createdAt), createSpace, addSpaceMember, getSpacesForUser, isSpaceMember, filterBySpace. READ.
- `apps/memroos/src/lib/db-schema.ts` — has spaces, space_members, agents, users tables. READ the migration patterns (look at applySpacesAndTeamScaleAccessSchema and applyIdentityLifecycleAndOwnerGatesSchema for how to add a v6 migration). Current version is 5.
- `apps/memroos/src/lib/audit/write.ts` — writeAuditEntry.
- `apps/memroos/src/lib/audit/event-types.ts` — AUDIT_EVENT_TYPES, ENTITY_TYPES.
- `apps/memroos/src/lib/__tests__/space.test.ts` — READ for test patterns.

## FILES TO CREATE/MODIFY

### 1. apps/memroos/src/lib/db-schema.ts — MODIFY
Add a v6 schema migration. Bump CURRENT_SCHEMA_VERSION to 6. Add migration entry to SCHEMA_MIGRATIONS. Add function `applyActiveWorkspaceSchema(db)`:
```sql
CREATE TABLE IF NOT EXISTS active_workspace (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id    TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  loaded_by   TEXT NOT NULL,
  loaded_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  is_headless INTEGER NOT NULL DEFAULT 0,
  cleared_at  TEXT
);
CREATE INDEX IF NOT EXISTS active_workspace_active ON active_workspace(cleared_at) WHERE cleared_at IS NULL;
```
Follow the exact pattern of the existing migrations (try/catch for idempotency, etc).

### 2. apps/memroos/src/lib/workspace.ts — NEW
```ts
import type Database from "better-sqlite3";
import { getSpacesForUser, type Space } from "@/lib/space";

export interface ActiveWorkspace {
  spaceId: string;
  spaceName: string;
  loadedBy: string;
  loadedAt: string;
  isHeadless: boolean;
}

// WORKLOAD-01: Load a space as the active workspace, prime context packet
export function loadWorkspace(db: Database.Database, input: {
  spaceId: string;
  actorId: string;
  isHeadless?: boolean;
}): ActiveWorkspace;

// Get the current active workspace (or null if none)
export function getActiveWorkspace(db: Database.Database): ActiveWorkspace | null;

// Clear the active workspace
export function clearWorkspace(db: Database.Database): void;

// WORKLOAD-03: Check if workspace selection is needed, return available spaces
export function promptWorkspaceSelection(db: Database.Database, actorId: string): {
  needsSelection: boolean;
  availableSpaces: Space[];
};

// WORKLOAD-04: Headless fail-closed — throws if no active workspace
export function assertWorkspaceForHeadless(db: Database.Database): ActiveWorkspace;

// WORKLOAD-05: Check if a write target is within the active workspace
export function isWriteTargetInWorkspace(db: Database.Database, targetSpaceId: string): boolean;

// WORKLOAD-05: Record a cross-space read in the run ledger
export function recordCrossSpaceRead(db: Database.Database, input: {
  fromSpaceId: string;
  toSpaceId: string;
  actorId: string;
  policyReceiptId?: string;
}): void;
```

Implementation details:
- `loadWorkspace`: First clear any existing active workspace (set cleared_at on the active row). Then insert a new active_workspace row. Query the space name from spaces table. Write a run ledger event (insert into agent_run_ledger_events or similar — check the db-schema for the run ledger table name and event structure). Write an audit row. Return ActiveWorkspace.
- `getActiveWorkspace`: Query active_workspace WHERE cleared_at IS NULL ORDER BY id DESC LIMIT 1. Join with spaces to get the name. Return null if none.
- `clearWorkspace`: UPDATE active_workspace SET cleared_at = current timestamp WHERE cleared_at IS NULL.
- `promptWorkspaceSelection`: Check getActiveWorkspace. If null, return needsSelection=true + getSpacesForUser(db, actorId). If not null, return needsSelection=false + empty array.
- `assertWorkspaceForHeadless`: Call getActiveWorkspace. If null, throw Error("headless mode requires an active workspace — no silent default (WORKLOAD-04)"). Return the workspace.
- `isWriteTargetInWorkspace`: Get active workspace. Return true if targetSpaceId === activeWorkspace.spaceId, false otherwise.
- `recordCrossSpaceRead`: Insert a run ledger event with actionType "workspace.cross_space_read" and metadata {fromSpaceId, toSpaceId, policyReceiptId}. Also write an audit row.

IMPORTANT: Check the db-schema.ts for the actual run ledger table name and event structure. The agent-context-packet.ts references it. You may need to look at how buildAgentContextPacket or readAgentRunLedger interact with the DB to understand the table structure. If there's no dedicated run ledger events table, use audit_entries with a specific event type.

### 3. apps/memroos/src/lib/__tests__/workspace.test.ts — NEW
```ts
// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { initSchema } from "@/lib/db-schema";
import { createSpace, addSpaceMember } from "@/lib/space";
import {
  loadWorkspace,
  getActiveWorkspace,
  clearWorkspace,
  promptWorkspaceSelection,
  assertWorkspaceForHeadless,
  isWriteTargetInWorkspace,
  recordCrossSpaceRead,
} from "@/lib/workspace";
```

Tests:
1. loadWorkspace creates an active workspace with correct fields; getActiveWorkspace returns it
2. Loading a new space replaces the previous active workspace (only one active at a time)
3. clearWorkspace clears the active workspace; getActiveWorkspace returns null
4. promptWorkspaceSelection returns needsSelection=true with available spaces when no active workspace
5. promptWorkspaceSelection returns needsSelection=false when workspace is active
6. assertWorkspaceForHeadless throws when no active workspace
7. assertWorkspaceForHeadless returns workspace when one is active
8. isWriteTargetInWorkspace returns true for matching space, false for non-matching
9. recordCrossSpaceRead writes a run ledger event / audit row (verify via query)
10. loadWorkspace writes a run ledger event (verify via query)

Setup: create in-memory DB, initSchema, create a space, add the actor as a member, then test.

## DO NOT
- Do NOT edit `security-regression.test.ts` or the wrapped function internals.
- Do NOT add any npm dependency.
- Do NOT commit or change git branch.
- Do NOT add "droid" as a platform or modify agent registration routes/types/forms.

## VERIFY BEFORE YOU FINISH (run these, paste output)
```
cd /Users/lcalderon/github/memroos/apps/memroos && npx vitest run src/lib/__tests__/workspace.test.ts src/lib/policy src/lib/memory/__tests__/security-regression.test.ts 2>&1 | tail -25
cd /Users/lcalderon/github/memroos/apps/memroos && npx tsc --noEmit 2>&1 | grep -E "src/lib/workspace" | head -10 ; echo "WORKSPACE-TSC-DONE"
```
All workspace tests + policy tests + MEMSEC-08 MUST pass, zero tsc errors under src/lib/workspace. Then STOP and report.
