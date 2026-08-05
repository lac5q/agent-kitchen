# Phase 227 — upgrade-path defect in `applyToolConnectionsSchema` (migration 38)

**Found:** 2026-08-05, while verifying merged main (`faaa2a62`) before resuming roadmap work.
**Severity:** blocks the pending deploy on any pre-existing database.
**Status:** FIXED — guard added, regression test proven two-way.

> Correction to the first draft of this note: the failing migration is **38**
> (`per-user-tool-connections`), not 40. `CURRENT_SCHEMA_VERSION` is 40
> (`polymorphic-memory-salience`); 38 is the one that throws.

## Symptom

Against a long-lived database, schema init throws and the app cannot start:

```
SqliteError: no such column: u.disabled_at
  at applyToolConnectionsSchema (src/lib/db-schema.ts:575)
  at runSchemaMigrations (src/lib/db-schema.ts:323)
  at initSchema (src/lib/db-schema.ts:727)
  at getDb (src/lib/db.ts:35)
```

Reproduced locally against `data/conversations.db` (1.0 GB, real history). 36 tests fail
in that checkout; the identical commit is green in a worktree that has no such database.

## Root cause

`applyToolConnectionsSchema` (migration **38**, registered at `db-schema.ts:295`) resolves a
default admin:

```sql
SELECT u.id
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
WHERE ur.role = 'admin' AND u.disabled_at IS NULL
ORDER BY u.created_at ASC, u.id ASC
LIMIT 1
```

It guards with `tableExists('users')` and `tableExists('user_roles')` — it checks that the
**tables** exist, but never that the `users` table has the `disabled_at` **column**.

The column reaches an existing `users` table only via
`ALTER TABLE users ADD COLUMN disabled_at TEXT` at `db-schema.ts:3984`. That ALTER lives
inside `applyCurrentSchema` — **migration 1**, `baseline-additive-schema` — where Phase 199
put it. `CREATE TABLE users` in the same body already includes the column.

`runSchemaMigrations` skips every migration at or below the stamped version:

```js
if (migration.version <= currentVersion) continue;
```

That is the bug:

- **Fresh install** — starts at 0, runs migration 1, gets `disabled_at`, and 38 succeeds.
  This is the only path the test suite exercises.
- **Upgrade** — any deployment is stamped far above 1, so migration 1 **never re-runs**.
  A database that was already stamped past 1 when Phase 199 shipped therefore never received
  the column. Migration 38 then prepares a statement against it, the prepare throws, the
  migration transaction aborts, and `initSchema` fails for every subsequent `getDb()`.

This is the identical failure class as the migration 34 regression documented in
`src/lib/__tests__/user-identities-migration.test.ts` — a schema element added to the
baseline body only, then depended on by a later migration. That one returned HTTP 500 on
oracle-1's Google OIDC callback. The lesson did not generalise: adding to migration 1 is
only safe for fresh installs, never for upgrades.

Observed shape of the affected `users` table (no `disabled_at`):

```
id  email  display_name  password_hash  tenant_id  created_at  last_login_at
```

## Why the suite did not catch it

The v8.30 session reported 3765 tests / 0 failures — run in a worktree with **no
pre-existing database**. Every test therefore took the fresh-install path. The suite
validates fresh installs, not upgrades, so this defect is invisible to it by construction.
The comment directly beneath the failing query even anticipates "partial historical
fixtures … stamped at an old version", so the legacy shape was considered — the guard was
simply written against the wrong thing (table presence, not column presence).

## Production risk

PR #5 (merged as `faaa2a62`) carries schema **v40**. Production on oracle-1 and
cordant-hermes-01 runs a long-lived database still on the pre-merge build (`7182580a`).
If that `users` table lacks `disabled_at` — which it will unless it was created after the
line-3984 ALTER shipped — **the deploy will fail at schema init and the service will not
come up.** Backups exist at v39 on both hosts.

**Verify before deploying:**

```bash
ssh oracle-1 "sqlite3 /path/to/conversations.db 'PRAGMA table_info(users);' | grep -c disabled_at"
```

`0` means this defect will fire on deploy.

## Fix applied

A `columnExists(table, column)` helper now sits alongside `tableExists`, and the
`AND u.disabled_at IS NULL` predicate is applied only where the column is actually present:

```js
const enabledOnly = hasUsers && columnExists('users', 'disabled_at')
  ? 'AND u.disabled_at IS NULL'
  : '';
```

Dropping the predicate rather than skipping the lookup preserves the migration's intent —
a database that never received `disabled_at` also never disabled anyone, so every admin is
enabled and the oldest one is still the right owner. Skipping the lookup instead would have
left tool_connections rows unowned and tripped the `needs_owner` trigger for no reason.

## Regression test (two-way, proven)

`src/lib/__tests__/tool-connections-migration.test.ts` builds a `users` table **without**
`disabled_at`, stamps it at 37, and asserts migrations complete and reach
`CURRENT_SCHEMA_VERSION`.

- **Before the fix:** 2 failed with `SqliteError: no such column: u.disabled_at`.
- **After the fix:** 3 passed, alongside the migration 34 and backfill suites (9 passed).

The third case adds `disabled_at` explicitly and asserts migration still succeeds, so the
test discriminates between the two states rather than passing unconditionally.

## Validated against the real database

The local `data/conversations.db` (1.0 GB) is stamped at **user_version 37**, has
`user_roles`, and its `users` table has no `disabled_at` — the exact shape the fixture
models. A copy of it was migrated with the fix in place: it completed without throwing,
reached `CURRENT_SCHEMA_VERSION` (40), and created `tool_connections`. So the whole
38 → 39 → 40 chain now runs end-to-end on real data, not just on a synthetic fixture.

## Still worth doing

The guard fixes this instance. The general hazard remains: **migration 1 never re-runs for
any existing deployment**, so anything added to its body is fresh-install-only. Two such
bugs have now shipped (34, 38). A `check:*` gate that fails when a migration above 1
references a column introduced in migration 1's body would catch the next one.
