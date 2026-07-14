You are a MiniMax-M3 WORKER on the memroos repo. Branch: v8.2-team-scale-access-policy-plane (already checked out; edit the working tree in place, do NOT switch branches, do NOT commit). CWD: /Users/lcalderon/github/memroos.

# TASK: Implement Phase 130 - Teams/Spaces + Knowledge-Repo Labels (TEAMSCALE-01 + MSIQ-01/02/03)

## HARD CONSTRAINT
Do NOT modify `authorizeMemoryUse`, `checkDispatchPolicy`, `checkA2aSendPolicy`, `checkMemoryWritePolicy` internals. Do NOT edit `security-regression.test.ts`. Do NOT break existing tests. Do NOT commit or change git branch.

## EXISTING SURFACES (read them first)

### TS side (apps/memroos):
- `apps/memroos/src/lib/db-schema.ts` — SQLite schema. Has `tenants`, `users`, `user_roles`, `user_api_keys`, `team_invitations` tables. The `messages` table has a `project` column (used for scoping). READ the file to understand the schema patterns (CREATE TABLE IF NOT EXISTS, indexes, REFERENCES).
- `apps/memroos/src/lib/vault/types.ts` — VaultVisibility, VaultDomain, VaultSensitivity, VaultPolicy, VaultLabel.
- `apps/memroos/src/lib/policy/engine.ts` — Phase 128/129 engine. Has dimension rules with `subject.team` matching.
- `apps/memroos/src/lib/__tests__/db.test.ts` — existing DB tests (READ for patterns: how to create in-memory DB, initSchema, etc).

### Python side (services/knowledge-mcp):
- `services/knowledge-mcp/knowledge_system/store.py` — KnowledgeStore class. Has `_validate_frontmatter(content)` (basic: checks name/description for skills), `search(query, limit, tenant_id, user_id, agent_id)` (simple text search, returns SearchResult dicts), `read_text(path, ...)`, `write_text(path, content, ..., require_frontmatter=False)`. READ the full file.
- `services/knowledge-mcp/knowledge_system/mcp_server.py` — MCP tool wrappers. Has `knowledge_write`, `knowledge_search`, `knowledge_read`, `knowledge_policy_check`.
- `services/knowledge-mcp/tests/test_tenant_isolation.py` — existing tests (READ for patterns: how to create KnowledgeStore, monkeypatch, tmp_path).

## FILES TO CREATE/MODIFY

### 1. apps/memroos/src/lib/db-schema.ts — MODIFY
Add spaces + space_members tables to the schema. Find the section after `team_invitations` (or after `password_reset_tokens`) and add:
```sql
CREATE TABLE IF NOT EXISTS spaces (
  id                   TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL DEFAULT 'default-tenant'
                       REFERENCES tenants(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  default_labels_json  TEXT NOT NULL DEFAULT '{}',
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS spaces_tenant ON spaces(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS spaces_tenant_name ON spaces(tenant_id, name);

CREATE TABLE IF NOT EXISTS space_members (
  space_id    TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  member_id   TEXT NOT NULL,
  member_type TEXT NOT NULL CHECK(member_type IN ('human', 'agent')),
  role        TEXT NOT NULL DEFAULT 'member',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (space_id, member_id)
);
CREATE INDEX IF NOT EXISTS space_members_member ON space_members(member_id);
```
Also add a `space_id` column to the `messages` table if it doesn't exist:
```sql
-- Add space_id column to messages (nullable for backward compat)
```
Use the same ALTER TABLE pattern used for other column additions in the file (look for `addBeliefStageColumns` or similar migration patterns).

### 2. apps/memroos/src/lib/space.ts — NEW
Space management functions:
```ts
import type Database from "better-sqlite3";
import crypto from "crypto";

export interface Space {
  id: string;
  tenantId: string;
  name: string;
  defaultLabels: Record<string, unknown>;
  createdAt: string;
}

export interface SpaceMember {
  spaceId: string;
  memberId: string;
  memberType: "human" | "agent";
  role: string;
}

export function createSpace(db: Database.Database, input: { tenantId: string; name: string; defaultLabels?: Record<string, unknown> }): Space;
export function addSpaceMember(db: Database.Database, input: { spaceId: string; memberId: string; memberType: "human" | "agent"; role?: string }): void;
export function getSpacesForUser(db: Database.Database, userId: string): Space[];
export function getSpaceDefaultLabels(db: Database.Database, spaceId: string): Record<string, unknown>;
export function isSpaceMember(db: Database.Database, spaceId: string, memberId: string): boolean;
// Filter message rows by space — returns only rows belonging to the given space
export function filterBySpace<T extends { space_id?: string | null; project?: string | null }>(rows: T[], spaceName: string): T[];
```
- `filterBySpace`: filters rows where `space_id` matches the space's id OR `project` matches the space's name (backward compat for rows without space_id).
- `createSpace`: generates UUID, inserts, returns the Space.
- `getSpacesForUser`: joins space_members + spaces, returns all spaces the user is a member of.

### 3. apps/memroos/src/lib/__tests__/space.test.ts — NEW
```ts
// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { initSchema } from "@/lib/db-schema";
import { createSpace, addSpaceMember, getSpacesForUser, getSpaceDefaultLabels, isSpaceMember, filterBySpace } from "@/lib/space";

// Tests:
// 1. createSpace returns a Space with id, name, defaultLabels
// 2. addSpaceMember + isSpaceMember works
// 3. getSpacesForUser returns only spaces the user is a member of (zero cross-space leakage)
// 4. filterBySpace filters rows by project name (backward compat)
// 5. default labels round-trip through JSON
```

### 4. services/knowledge-mcp/knowledge_system/store.py — MODIFY

#### 4a. Extend frontmatter validation for knowledge labels
Add a new function `_validate_knowledge_labels(content: str) -> tuple[bool, str]`:
- Parse YAML frontmatter (reuse the existing split("---", 2) pattern)
- If frontmatter contains `sensitivity:`, validate it's one of: public, internal, confidential, restricted
- If frontmatter contains `authoritative:`, validate it's a boolean (true/false)
- If frontmatter contains `verified_at:`, validate it's an ISO date string (YYYY-MM-DD)
- If frontmatter contains `expires_at:`, validate it's an ISO date string
- Return (True, "") if valid or no labels present; (False, reason) if invalid
- Call this in `write_text` when `require_frontmatter=True` or path starts with `content/` (knowledge repo docs)

#### 4b. Add `_extract_labels(content: str) -> dict` helper
Parse frontmatter and return a dict with any present labels: {sensitivity, authoritative, verified_at, expires_at}. Return empty dict if no frontmatter or no labels.

#### 4c. Label-aware authorization in search
In the `search` method, after collecting results but before returning:
- For each result, read the file's frontmatter labels (or pre-compute during the scan)
- If a doc has `sensitivity: restricted` and the agent role is not "admin" or "operator", filter it out
- If a doc has `sensitivity: confidential` and the agent role is not "admin", "operator", or "reviewer", filter it out
- If `sensitivity` is absent, public, or internal: allow (default-open)
- Add `label_authorized: true` to each returned search result
- For filtered results, they simply don't appear (no leak)

#### 4d. Label-aware authorization in read_text
In `read_text`, after reading the file:
- Extract labels from the content
- If `sensitivity: restricted` and agent role not admin/operator: return a forbidden dict
- If `sensitivity: confidential` and agent role not admin/operator/reviewer: return a forbidden dict
- Otherwise: add `label_authorized: true` to the response
- Unlabeled docs: default-open, add `label_authorized: true`

#### 4e. Ranking in search
After filtering, sort results:
- `authoritative: true` docs get sorted first (within same query-match relevance)
- `expires_at` past current date → sorted last, add `expired: true` to the result
- `verified_at` absent → add `unverified: true` to the result (not demoted)
- Maintain the existing limit

#### 4f. Add `flag_expired_unverified()` method to KnowledgeStore
```python
def flag_expired_unverified(self) -> list[dict]:
    """Scan all markdown files and return a list of expired/unverified docs.
    
    Returns [{path, expired: bool, unverified: bool, expires_at, verified_at}, ...]
    for docs that are expired or unverified.
    """
```

### 5. services/knowledge-mcp/tests/test_knowledge_labels.py — NEW
Tests for:
1. `_validate_knowledge_labels`: valid labels pass, invalid sensitivity rejected, invalid date rejected, no labels pass (default-open)
2. Label-aware search: restricted docs filtered for agents, visible for admins
3. Label-aware read: restricted doc returns forbidden for agents, content for admins
4. Ranking: authoritative first, expired last with expired flag
5. `flag_expired_unverified`: finds expired and unverified docs
6. Unlabeled docs: default-open, no filtering

Use the same test patterns as `test_tenant_isolation.py` (monkeypatch, tmp_path, KnowledgeStore(root)).

## DO NOT
- Do NOT edit `security-regression.test.ts` or the wrapped function internals.
- Do NOT add any npm or pip dependency.
- Do NOT commit or change git branch.
- Do NOT break existing tests (run them to verify).

## VERIFY BEFORE YOU FINISH (run these, paste output)
```
cd /Users/lcalderon/github/memroos/apps/memroos && npx vitest run src/lib/__tests__/space.test.ts src/lib/policy src/lib/memory/__tests__/security-regression.test.ts 2>&1 | tail -25
cd /Users/lcalderon/github/memroos/apps/memroos && npx tsc --noEmit 2>&1 | grep -E "src/lib/space" | head -10 ; echo "SPACE-TSC-DONE"
cd /Users/lcalderon/github/memroos && .venv/bin/python -m pytest services/knowledge-mcp/tests/test_knowledge_labels.py services/knowledge-mcp/tests/test_tenant_isolation.py -q 2>&1 | tail -15
```
All space tests + policy tests + MEMSEC-08 MUST pass, zero tsc errors under src/lib/space, and all Python label + tenant isolation tests MUST pass. Then STOP and report: files created/modified, test counts, and the exact verify output.
