You are a WORKER on the memroos repo. Branch: v8.4-project-centric-operator-ux (already checked out; edit the working tree in place, do NOT switch branches, do NOT commit). CWD: /Users/lcalderon/github/memroos.

# TASK: Implement Phase 141 - Save-Artifact Gate + Auto-README Update (ARTGATE-01..03)

## HARD CONSTRAINT
Do NOT modify `authorizeMemoryUse`, `checkDispatchPolicy`, `checkA2aSendPolicy`, `checkMemoryWritePolicy` internals. Do NOT edit `security-regression.test.ts`. Do NOT break existing tests. Do NOT commit or change git branch. Do NOT add any npm dependency.

## EXISTING SURFACES (read them first)
- `apps/memroos/src/lib/space.ts` — READ. createSpace, Space interface.
- `apps/memroos/src/lib/db-schema.ts` — READ. Current schema version is 9. Look at migration patterns.
- `apps/memroos/src/lib/workspace.ts` — READ. getActiveWorkspace, isWriteTargetInWorkspace.
- `apps/memroos/src/lib/write-rules.ts` — READ. createDocumentDirectoryEntry, getDocumentDirectory, updateDocumentDirectoryEntry, DocumentDirectoryEntry interface.
- `apps/memroos/src/lib/shared-space.ts` — READ. assertWritableSpace, isSpaceShared.
- `apps/memroos/src/lib/workspace.ts` — READ for audit_entries INSERT patterns.
- `apps/memroos/src/lib/__tests__/workspace.test.ts` — READ for test patterns.

## FILES TO CREATE/MODIFY

### 1. apps/memroos/src/lib/db-schema.ts — MODIFY
Add a v10 schema migration. Bump CURRENT_SCHEMA_VERSION to 10. Add migration entry to SCHEMA_MIGRATIONS. Add function `applyArtifactGateSchema(db)`:

```sql
CREATE TABLE IF NOT EXISTS space_artifact_settings (
  space_id              TEXT PRIMARY KEY REFERENCES spaces(id) ON DELETE CASCADE,
  auto_readme_update    INTEGER NOT NULL DEFAULT 1,
  last_artifact_resource_id TEXT,
  last_artifact_name    TEXT,
  last_artifact_saved_at TEXT,
  updated_by            TEXT,
  updated_at            TEXT
);
```

Follow the exact pattern of existing migrations.

### 2. apps/memroos/src/lib/artifact-gate.ts — NEW

Follow the same code style as workspace.ts, write-rules.ts, shared-space.ts, space-cache.ts.

**Interfaces:**
```ts
export interface SavePromptResult {
  spaceId: string;
  spaceName: string;
  artifactName: string;
  artifactType: string;
  prompt: string;
}
```

Import from existing modules:
```ts
import type Database from "better-sqlite3";
import { assertWritableSpace } from "@/lib/shared-space";
import { isWriteTargetInWorkspace, getActiveWorkspace } from "@/lib/workspace";
import { createDocumentDirectoryEntry, updateDocumentDirectoryEntry, getDocumentDirectory, type DocumentDirectoryEntry } from "@/lib/write-rules";
```

**Functions:**

1. `promptSaveArtifact(db, input: { spaceId: string; artifactName: string; artifactType: string }): SavePromptResult` — ARTGATE-01. Look up the space name from spaces table. Return { spaceId, spaceName, artifactName, artifactType, prompt: `Save to ${spaceName}?` }. Throw if space not found.

2. `saveArtifact(db, input: { spaceId: string; artifactName: string; artifactType: string; resourceId: string; beliefStage: string; actorId: string; purpose?: string }): { documentDirectoryEntry: DocumentDirectoryEntry; readmeUpdated: boolean }` — ARTGATE-02 + ARTGATE-03.
   - Call assertWritableSpace(db, input.spaceId) — throws if shared/read-only.
   - Call isWriteTargetInWorkspace(db, input.spaceId) — if false, throw Error("saveArtifact: space is not the active workspace — load the workspace first").
   - Check if a document_directory entry with the same name already exists for this space (via getDocumentDirectory). If so, update it with the new resourceId via updateDocumentDirectoryEntry. If not, create a new one via createDocumentDirectoryEntry.
   - Write audit_entries with event_type='artifact.saved', entity_type='artifact', entity_id=`artifact:${input.resourceId}`, metadata_json with { spaceId, resourceId, beliefStage, artifactName, artifactType, actionType: 'artifact.saved' }.
   - If isAutoReadmeUpdateEnabled returns true: UPDATE space_artifact_settings SET last_artifact_resource_id=?, last_artifact_name=?, last_artifact_saved_at=?, updated_by=?, updated_at=? WHERE space_id=?. If no row exists, INSERT one. Write audit_entries with event_type='artifact.readme_updated'. Set readmeUpdated=true.
   - If auto-update is disabled, set readmeUpdated=false.
   - Return { documentDirectoryEntry, readmeUpdated }.

3. `setAutoReadmeUpdate(db, input: { spaceId: string; enabled: boolean; actorId: string }): void` — ARTGATE-03. Upsert into space_artifact_settings (auto_readme_update = enabled ? 1 : 0). Write audit_entries with event_type='artifact.auto_readme_toggled', metadata with { enabled, actionType }.

4. `isAutoReadmeUpdateEnabled(db, spaceId: string): boolean` — Query space_artifact_settings. Return true if no row exists (default), or if auto_readme_update=1. Return false if auto_readme_update=0.

5. `getLastArtifactPointer(db, spaceId: string): { resourceId: string | null; name: string | null; savedAt: string | null } | null` — Query space_artifact_settings. Return the last_artifact_* fields, or null if no row or all fields are null.

IMPORTANT: Use the same audit_entries INSERT pattern as workspace.ts (columns: id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at). Use parameterized SQL with ? placeholders.

### 3. apps/memroos/src/lib/__tests__/artifact-gate.test.ts — NEW

Follow the test pattern from workspace.test.ts. At minimum 12 tests:
1. promptSaveArtifact returns correct prompt with space name
2. promptSaveArtifact throws for non-existent space
3. saveArtifact creates a new document directory entry and emits audit event
4. saveArtifact updates existing document directory entry if name matches
5. saveArtifact throws on shared (read-only) spaces
6. saveArtifact throws if space is not the active workspace
7. saveArtifact with auto-README enabled updates last_artifact_* fields
8. saveArtifact with auto-README disabled does not update last_artifact_* fields
9. setAutoReadmeUpdate toggles the flag and writes audit event
10. isAutoReadmeUpdateEnabled returns true by default
11. isAutoReadmeUpdateEnabled returns false when disabled
12. getLastArtifactPointer returns last saved artifact info

Setup: create in-memory DB, initSchema, create a space, add a member, load the workspace (loadWorkspace from workspace.ts), then test. For shared-space tests, call setSpaceShared before saveArtifact.

## DO NOT
- Do NOT edit `security-regression.test.ts` or the wrapped function internals.
- Do NOT add any npm dependency.
- Do NOT commit or change git branch.

## VERIFY BEFORE YOU FINISH (run these, paste output)
```
cd /Users/lcalderon/github/memroos/apps/memroos && npx vitest run src/lib/__tests__/artifact-gate.test.ts src/lib/policy src/lib/memory/__tests__/security-regression.test.ts src/lib/__tests__/workspace.test.ts src/lib/__tests__/write-rules.test.ts src/lib/__tests__/shared-space.test.ts src/lib/__tests__/space-cache.test.ts 2>&1 | tail -25
cd /Users/lcalderon/github/memroos/apps/memroos && npx tsc --noEmit 2>&1 | grep -E "src/lib/artifact-gate" | head -10; echo "ARTGATE-TSC-DONE"
```
All tests MUST pass, zero tsc errors. Then STOP and report.
