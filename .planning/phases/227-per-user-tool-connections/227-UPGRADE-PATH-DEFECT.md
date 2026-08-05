# Phase 227 — upgrade-path defect in `applyToolConnectionsSchema` (schema v40)

**Found:** 2026-08-05, while verifying merged main (`faaa2a62`) before resuming roadmap work.
**Severity:** blocks the pending v40 production deploy on any pre-existing database.
**Status:** open — not yet fixed.

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

`applyToolConnectionsSchema` (migration **v40**, registered at `db-schema.ts:295`) resolves a
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
`ALTER TABLE users ADD COLUMN disabled_at TEXT` at `db-schema.ts:3984`, which is registered
**after** v40. The `CREATE TABLE users` at `db-schema.ts:3893` does include `disabled_at`.

That split is the bug:

- **Fresh install** — `users` is created with `disabled_at` already present, so v40 succeeds.
  This is the only path the test suite exercises.
- **Upgrade** — a database stamped below v40 has a `users` table predating `disabled_at`.
  v40 runs before the ALTER that would add it, the prepare throws, the migration transaction
  aborts, and `initSchema` fails for every subsequent `getDb()`.

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

## Suggested fix (not applied)

Guard on the column, not the table, and fall back to no-admin rather than throwing:

- add a `columnExists(table, column)` helper alongside `tableExists`
- include `columnExists('users', 'disabled_at')` in the `admin` ternary's condition
- or reorder so the `disabled_at` ALTER precedes v40

Per the ratchet rule, the regression test must be written as an attack: build a fixture
`users` table **without** `disabled_at`, stamp it below v40, run migrations, and assert
they complete. It must fail if the guard is reverted.
