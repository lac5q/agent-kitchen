You are a MiniMax-M3 WORKER on the memroos repo. Branch: v8.4-project-centric-operator-ux (already checked out; edit the working tree in place, do NOT switch branches, do NOT commit). CWD: /Users/lcalderon/github/memroos.

# TASK: Implement Phase 138 - Operator-Visible Write Rules + Document Directory (WRITERULES-01..06)

## HARD CONSTRAINT
Do NOT modify `authorizeMemoryUse`, `checkDispatchPolicy`, `checkA2aSendPolicy`, `checkMemoryWritePolicy` internals. Do NOT edit `security-regression.test.ts`. Do NOT break existing tests. Do NOT commit or change git branch. Do NOT add any npm dependency.

## EXISTING SURFACES (read them first)
- `apps/memroos/src/lib/space.ts` — READ. Space interface (id, tenantId, name, defaultLabels, createdAt), createSpace, getSpacesForUser, addSpaceMember.
- `apps/memroos/src/lib/db-schema.ts` — READ. Has spaces, space_members, active_workspace tables. Current schema version is 6. Look at applyActiveWorkspaceSchema and applyIdentityLifecycleAndOwnerGatesSchema for migration patterns. The SCHEMA_MIGRATIONS array and CURRENT_SCHEMA_VERSION constant.
- `apps/memroos/src/lib/workspace.ts` — READ for patterns (audit_entries INSERT shape, error handling style).
- `apps/memroos/src/lib/__tests__/workspace.test.ts` — READ for test patterns (freshDb, setupWorkspace, countAuditRows helper).
- `apps/memroos/src/lib/__tests__/space.test.ts` — READ for test patterns.

## FILES TO CREATE/MODIFY

### 1. apps/memroos/src/lib/db-schema.ts — MODIFY
Add a v7 schema migration. Bump CURRENT_SCHEMA_VERSION to 7. Add migration entry to SCHEMA_MIGRATIONS. Add function `applyWriteRulesAndDocumentDirectorySchema(db)`:

```sql
CREATE TABLE IF NOT EXISTS write_rules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id      TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  data_type     TEXT NOT NULL,
  target_document TEXT NOT NULL,
  fallback_rule TEXT NOT NULL DEFAULT 'reject' CHECK(fallback_rule IN ('reject','default_doc')),
  version       INTEGER NOT NULL DEFAULT 1,
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT,
  updated_by    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS write_rules_space_type ON write_rules(space_id, data_type);
CREATE INDEX IF NOT EXISTS write_rules_space ON write_rules(space_id);

CREATE TABLE IF NOT EXISTS document_directory (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id      TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  purpose       TEXT,
  resource_id   TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT,
  updated_by    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS document_directory_space_name ON document_directory(space_id, name);
CREATE INDEX IF NOT EXISTS document_directory_space ON document_directory(space_id);
```

Follow the exact pattern of existing migrations (try/catch for idempotency if needed, though CREATE TABLE IF NOT EXISTS is inherently idempotent).

### 2. apps/memroos/src/lib/write-rules.ts — NEW

Implement these functions following the same code style as workspace.ts (parameterized SQL via .prepare().run(), proper error messages with function name prefix, audit_entries INSERT for run ledger events):

**Interfaces:**
```ts
export interface WriteRule {
  id: number;
  spaceId: string;
  dataType: string;
  targetDocument: string;
  fallbackRule: "reject" | "default_doc";
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface DocumentDirectoryEntry {
  id: number;
  spaceId: string;
  name: string;
  purpose: string | null;
  resourceId: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string | null;
  updatedBy: string | null;
}
```

**Functions:**

1. `validateWriteRule(input: { dataType: string; targetDocument: string; fallbackRule?: string }): { valid: boolean; errors: string[] }` — WRITERULES-06. Reject empty dataType, empty targetDocument, fallbackRule not in ('reject','default_doc'). Default fallbackRule to 'reject' if not provided.

2. `createWriteRule(db, input: { spaceId: string; dataType: string; targetDocument: string; fallbackRule?: string; actorId: string }): WriteRule` — WRITERULES-01. Validate first (throw with structured errors if invalid). INSERT into write_rules. Write audit_entries with event_type='write_rule.created'. Return the created rule.

3. `getWriteRules(db, spaceId: string): WriteRule[]` — Return all rules for a space, ordered by data_type ASC.

4. `updateWriteRule(db, ruleId: number, input: { targetDocument?: string; fallbackRule?: string; actorId: string; expectedVersion: number }): WriteRule` — WRITERULES-05. Optimistic locking: SELECT current version, if != expectedVersion throw Error("write rule version conflict: expected X, found Y"). UPDATE with incremented version. Write audit_entries with event_type='write_rule.updated'. Return updated rule.

5. `deleteWriteRule(db, ruleId: number, input: { actorId: string; expectedVersion: number }): void` — WRITERULES-05. Optimistic locking check. DELETE. Write audit_entries with event_type='write_rule.deleted'.

6. `resolveWriteTarget(db, spaceId: string, dataType: string): { matched: boolean; targetDocument: string | null; receiptReason: string }` — WRITERULES-02. Look up write_rules for (spaceId, dataType). If found, return { matched: true, targetDocument: rule.targetDocument, receiptReason: "matched" }. If not found, check if any rule has fallback_rule='default_doc' — if so return { matched: true, targetDocument: that rule's targetDocument, receiptReason: "fallback" }. Otherwise return { matched: false, targetDocument: null, receiptReason: "no matching write rule and fallback is reject" }. When matched=false, write audit_entries with event_type='write_rule.mismatch'.

7. `createDocumentDirectoryEntry(db, input: { spaceId: string; name: string; purpose?: string; resourceId?: string; actorId: string }): DocumentDirectoryEntry` — WRITERULES-03. INSERT into document_directory. Write audit_entries with event_type='document_dir.created'. Return entry.

8. `getDocumentDirectory(db, spaceId: string): DocumentDirectoryEntry[]` — Return all entries for a space, ordered by name ASC.

9. `updateDocumentDirectoryEntry(db, entryId: number, input: { name?: string; purpose?: string; resourceId?: string; actorId: string; expectedVersion: number }): DocumentDirectoryEntry` — WRITERULES-05. Optimistic locking. UPDATE with incremented version. Write audit_entries with event_type='document_dir.updated'. Return entry.

10. `deleteDocumentDirectoryEntry(db, entryId: number, input: { actorId: string; expectedVersion: number }): void` — WRITERULES-05. Optimistic locking. DELETE. Write audit_entries with event_type='document_dir.deleted'.

11. `checkWriteRuleDrift(db, spaceId: string, agentKnownVersion: number): { isStale: boolean; currentVersion: number; driftReceiptReason: string }` — WRITERULES-04. Get the max version across all write_rules for the space. If agentKnownVersion < currentVersion, return { isStale: true, currentVersion, driftReceiptReason: "agent view is stale" }. Otherwise { isStale: false, currentVersion, driftReceiptReason: "current" }.

IMPORTANT: Check the db-schema.ts for the audit_entries table schema to match the INSERT shape. Look at workspace.ts for the exact audit_entries INSERT pattern (columns: id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at).

### 3. apps/memroos/src/lib/__tests__/write-rules.test.ts — NEW

Follow the test pattern from workspace.test.ts:
```ts
// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { initSchema } from "@/lib/db-schema";
import { createSpace } from "@/lib/space";
import { ... } from "@/lib/write-rules";
```

Tests (at minimum 15):
1. validateWriteRule accepts valid input, rejects empty dataType, empty targetDocument, invalid fallbackRule
2. createWriteRule creates a rule; getWriteRules returns it
3. createWriteRule with duplicate (spaceId, dataType) throws unique constraint error
4. createWriteRule with invalid data throws validation error
5. updateWriteRule with correct version succeeds and increments version
6. updateWriteRule with wrong version throws version conflict error
7. deleteWriteRule with correct version succeeds
8. deleteWriteRule with wrong version throws version conflict error
9. resolveWriteTarget matches data type to target document
10. resolveWriteTarget returns mismatch when no rule and fallback is reject (writes mismatch audit)
11. resolveWriteTarget uses default_doc fallback when no direct match
12. createDocumentDirectoryEntry creates entry; getDocumentDirectory returns it
13. updateDocumentDirectoryEntry with optimistic locking works
14. checkWriteRuleDrift detects stale agent view
15. loadWorkspace writes audit rows for all CRUD operations (verify via countAuditRows helper)

Setup: create in-memory DB, initSchema, create a space, then test.

## DO NOT
- Do NOT edit `security-regression.test.ts` or the wrapped function internals.
- Do NOT add any npm dependency.
- Do NOT commit or change git branch.
- Do NOT add "droid" as a platform or modify agent registration routes/types/forms.

## VERIFY BEFORE YOU FINISH (run these, paste output)
```
cd /Users/lcalderon/github/memroos/apps/memroos && npx vitest run src/lib/__tests__/write-rules.test.ts src/lib/policy src/lib/memory/__tests__/security-regression.test.ts src/lib/__tests__/workspace.test.ts 2>&1 | tail -25
cd /Users/lcalderon/github/memroos/apps/memroos && npx tsc --noEmit 2>&1 | grep -E "src/lib/write-rules" | head -10; echo "WRITERULES-TSC-DONE"
```
All write-rules tests + policy tests + MEMSEC-08 + workspace tests MUST pass, zero tsc errors under src/lib/write-rules. Then STOP and report.
