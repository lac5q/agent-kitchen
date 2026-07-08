You are a WORKER on the memroos repo. Branch: v8.4-project-centric-operator-ux (already checked out; edit the working tree in place, do NOT switch branches, do NOT commit). CWD: /Users/lcalderon/github/memroos.

# TASK: Implement Phase 139 - is_shared: Single-Boolean Read-Only Toggle (SHAREDRO-01..03)

## HARD CONSTRAINT
Do NOT modify `authorizeMemoryUse`, `checkDispatchPolicy`, `checkA2aSendPolicy`, `checkMemoryWritePolicy` internals. Do NOT edit `security-regression.test.ts`. Do NOT break existing tests. Do NOT commit or change git branch. Do NOT add any npm dependency.

## EXISTING SURFACES (read them first)
- `apps/memroos/src/lib/space.ts` — READ. Space interface, createSpace.
- `apps/memroos/src/lib/db-schema.ts` — READ. Has spaces table. Current schema version is 7. Look at migration patterns (applyActiveWorkspaceSchema etc). The SCHEMA_MIGRATIONS array and CURRENT_SCHEMA_VERSION constant.
- `apps/memroos/src/lib/workspace.ts` — READ for patterns (audit_entries INSERT shape, error handling).
- `apps/memroos/src/lib/write-rules.ts` — READ for patterns (audit_entries INSERT, optimistic locking, validation).
- `apps/memroos/src/lib/__tests__/workspace.test.ts` — READ for test patterns.

## FILES TO CREATE/MODIFY

### 1. apps/memroos/src/lib/db-schema.ts — MODIFY
Add a v8 schema migration. Bump CURRENT_SCHEMA_VERSION to 8. Add migration entry to SCHEMA_MIGRATIONS. Add function `applySharedSpaceSchema(db)`:

```sql
ALTER TABLE spaces ADD COLUMN is_shared INTEGER NOT NULL DEFAULT 0;
ALTER TABLE spaces ADD COLUMN shared_reason TEXT;
```

Use try/catch around each ALTER TABLE for idempotency (column may already exist on re-run). Follow the pattern used by applyIdentityLifecycleAndOwnerGatesSchema which does `try { db.exec("ALTER TABLE ...") } catch { /* column already exists */ }`.

### 2. apps/memroos/src/lib/shared-space.ts — NEW

Follow the same code style as workspace.ts and write-rules.ts (parameterized SQL, function-name-prefixed errors, best-effort audit_entries INSERTs).

```ts
import type Database from "better-sqlite3";

// SHAREDRO-03: Set the is_shared flag on a space
export function setSpaceShared(db: Database.Database, input: {
  spaceId: string;
  isShared: boolean;
  actorId: string;
  reason?: string;
}): void;

// Check if a space is shared (read-only)
export function isSpaceShared(db: Database.Database, spaceId: string): boolean;

// SHAREDRO-01: Write-persistence gate — throws if space is shared
export function assertWritableSpace(db: Database.Database, spaceId: string): void;

// SHAREDRO-02: Read-side gate — writes a policy receipt for reads on shared spaces
export function assertReadableSpace(db: Database.Database, input: {
  spaceId: string;
  actorId: string;
}): void;

// SHAREDRO-03: Get the toggle history from audit entries
export function getSharedToggleHistory(db: Database.Database, spaceId: string): Array<{
  actorId: string;
  isShared: boolean;
  reason: string | null;
  timestamp: string;
}>;
```

Implementation details:
- `setSpaceShared`: If turning OFF (isShared=false), require a reason — throw Error("setSpaceShared: reason is required when toggling is_shared off (SHAREDRO-03)") if missing or empty. UPDATE spaces SET is_shared = ?, shared_reason = ? WHERE id = ?. Write audit_entries with event_type='space.shared_toggle', entity_type='space', entity_id=`space:${spaceId}`, metadata_json with { isShared, reason, actionType: 'space.shared_toggle' }. Use the same audit_entries INSERT pattern as workspace.ts.
- `isSpaceShared`: SELECT is_shared FROM spaces WHERE id = ?. Return false if space not found or is_shared is 0.
- `assertWritableSpace`: Call isSpaceShared. If true, throw Error("space is shared read-only — writes blocked (SHAREDRO-01)"). If space not found, throw Error("assertWritableSpace: space not found").
- `assertReadableSpace`: Call isSpaceShared. If true, write audit_entries with event_type='space.shared_read', entity_type='space', entity_id=`space:${spaceId}`, metadata_json with { spaceId, actorId, isShared: true, actionType: 'space.shared_read' }. If not shared, do nothing (normal read path, no receipt needed).
- `getSharedToggleHistory`: Query audit_entries WHERE event_type='space.shared_toggle' AND entity_id = ? (passing `space:${spaceId}`). Parse metadata_json for each row. Return array of { actorId, isShared, reason, timestamp }.

### 3. apps/memroos/src/lib/__tests__/shared-space.test.ts — NEW

Follow the test pattern from workspace.test.ts:
```ts
// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { initSchema } from "@/lib/db-schema";
import { createSpace } from "@/lib/space";
import { setSpaceShared, isSpaceShared, assertWritableSpace, assertReadableSpace, getSharedToggleHistory } from "@/lib/shared-space";
```

Tests (at minimum 10):
1. setSpaceShared sets the flag to true; isSpaceShared returns true
2. setSpaceShared sets the flag to false with a reason; isSpaceShared returns false
3. setSpaceShared throws when turning off without a reason
4. assertWritableSpace throws when space is shared
5. assertWritableSpace passes (no throw) when space is not shared
6. assertWritableSpace throws when space not found
7. assertReadableSpace writes a policy receipt for shared space reads (verify via audit_entries query)
8. assertReadableSpace does not write a receipt for non-shared spaces
9. getSharedToggleHistory returns toggle events with correct metadata
10. setSpaceShared writes an audit entry with event_type='space.shared_toggle'

Setup: create in-memory DB, initSchema, create a space, then test.

## DO NOT
- Do NOT edit `security-regression.test.ts` or the wrapped function internals.
- Do NOT add any npm dependency.
- Do NOT commit or change git branch.
- Do NOT add "droid" as a platform or modify agent registration routes/types/forms.

## VERIFY BEFORE YOU FINISH (run these, paste output)
```
cd /Users/lcalderon/github/memroos/apps/memroos && npx vitest run src/lib/__tests__/shared-space.test.ts src/lib/policy src/lib/memory/__tests__/security-regression.test.ts src/lib/__tests__/workspace.test.ts src/lib/__tests__/write-rules.test.ts 2>&1 | tail -25
cd /Users/lcalderon/github/memroos/apps/memroos && npx tsc --noEmit 2>&1 | grep -E "src/lib/shared-space" | head -10; echo "SHAREDRO-TSC-DONE"
```
All shared-space tests + policy tests + MEMSEC-08 + workspace + write-rules tests MUST pass, zero tsc errors under src/lib/shared-space. Then STOP and report.
