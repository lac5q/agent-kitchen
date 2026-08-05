// @vitest-environment node
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { CURRENT_SCHEMA_VERSION, getSchemaVersion, initSchema } from "@/lib/db-schema";

/**
 * Migration 38 regression.
 *
 * Migration 38 resolves a default admin with `u.disabled_at IS NULL`, but that
 * column reaches `users` only through migration 1's baseline body, where Phase
 * 199 added it. `runSchemaMigrations` skips every migration at or below the
 * stamped version, so a database stamped above 1 — which is every deployment —
 * never re-runs the baseline and never receives the column. Migration 38 then
 * prepares a statement against it and the whole transaction aborts, so
 * `initSchema` throws for every later `getDb()`.
 *
 * Fresh installs are immune: they start at 0, run migration 1, and get the
 * column before 38 asks for it. That is the same shape as the migration 34
 * regression next door — a column added to the baseline body only, then
 * depended on by a later migration.
 */
describe("migration 38 — tool connections against an existing users table", () => {
  /** Mimic a deployed DB: users predates disabled_at, stamped at 37. */
  function stampedAt37(): Database.Database {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        display_name  TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        tenant_id     TEXT,
        created_at    TEXT NOT NULL DEFAULT '2026-01-01T00:00:00Z',
        last_login_at TEXT
      );
      CREATE TABLE user_roles (
        user_id TEXT NOT NULL,
        role    TEXT NOT NULL
      );
      INSERT INTO users (id, email, display_name, password_hash)
        VALUES ('u-1', 'admin@example.com', 'Admin', 'x');
      INSERT INTO user_roles (user_id, role) VALUES ('u-1', 'admin');
    `);
    db.pragma("user_version = 37");
    return db;
  }

  it("migrates a database whose users table has no disabled_at column", () => {
    const db = stampedAt37();

    const columns = db
      .prepare("SELECT COUNT(*) AS n FROM pragma_table_info('users') WHERE name = 'disabled_at'")
      .get() as { n: number };
    expect(columns.n).toBe(0); // the bug's precondition

    expect(() => initSchema(db)).not.toThrow();
    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);

    db.close();
  });

  it("still creates tool_connections on that database", () => {
    const db = stampedAt37();
    initSchema(db);

    const table = db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='tool_connections'")
      .get() as { n: number };
    expect(table.n).toBe(1);

    db.close();
  });

  it("still resolves the admin owner when disabled_at is present", () => {
    const db = stampedAt37();
    db.exec("ALTER TABLE users ADD COLUMN disabled_at TEXT");

    expect(() => initSchema(db)).not.toThrow();
    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);

    db.close();
  });
});
