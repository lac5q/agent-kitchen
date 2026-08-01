// @vitest-environment node
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { CURRENT_SCHEMA_VERSION, getSchemaVersion, initSchema } from "@/lib/db-schema";

/**
 * Migration 34 regression.
 *
 * Phase 203 added `user_identities` to the main schema body only. That body
 * re-runs only for a database below its migration version, so fresh installs
 * got the table and every already-stamped deployment silently did not.
 * oracle-1 sat at version 33 and returned HTTP 500 on the Google OIDC callback
 * with `no such table: user_identities`.
 *
 * A fresh-install test cannot catch this — it passes either way. The bug is
 * only visible when init runs against a database that is ALREADY stamped, so
 * that is what these tests do.
 */
describe("migration 34 — user_identities on existing databases", () => {
  /** Mimic a deployed DB: users exists, stamped at 33, no user_identities. */
  function stampedAt33(): Database.Database {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        display_name  TEXT NOT NULL,
        password_hash TEXT NOT NULL
      );
      INSERT INTO users (id, email, display_name, password_hash)
        VALUES ('u-1', 'eric@cordant.ai', 'Eric', 'x');
    `);
    db.pragma("user_version = 33");
    return db;
  }

  it("creates user_identities on a database already stamped at 33", () => {
    const db = stampedAt33();

    const before = db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='user_identities'")
      .get() as { n: number };
    expect(before.n).toBe(0); // the bug's precondition

    initSchema(db);

    const after = db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='user_identities'")
      .get() as { n: number };
    expect(after.n).toBe(1);
    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);

    db.close();
  });

  it("creates the lookup index too", () => {
    const db = stampedAt33();
    initSchema(db);

    const idx = db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='user_identities_user'")
      .get() as { n: number };
    expect(idx.n).toBe(1);

    db.close();
  });

  it("accepts a google identity row and rejects an unknown provider", () => {
    const db = stampedAt33();
    initSchema(db);

    db.prepare("INSERT INTO user_identities (provider, subject, user_id) VALUES (?, ?, ?)")
      .run("google", "sub-123", "u-1");

    const row = db
      .prepare("SELECT provider, subject, user_id FROM user_identities WHERE subject = ?")
      .get("sub-123") as { provider: string; subject: string; user_id: string };
    expect(row.provider).toBe("google");
    expect(row.user_id).toBe("u-1");

    // The CHECK constraint must survive the migration, not just the fresh DDL.
    expect(() =>
      db.prepare("INSERT INTO user_identities (provider, subject, user_id) VALUES (?, ?, ?)")
        .run("github", "sub-456", "u-1")
    ).toThrow();

    db.close();
  });

  it("is idempotent — re-running init leaves the table intact", () => {
    const db = stampedAt33();
    initSchema(db);
    db.prepare("INSERT INTO user_identities (provider, subject, user_id) VALUES (?, ?, ?)")
      .run("google", "sub-789", "u-1");

    initSchema(db); // second boot

    const row = db.prepare("SELECT COUNT(*) AS n FROM user_identities").get() as { n: number };
    expect(row.n).toBe(1);
    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);

    db.close();
  });

  it("a fresh database also gets the table (parity with the migrated path)", () => {
    const db = new Database(":memory:");
    initSchema(db);

    const t = db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='user_identities'")
      .get() as { n: number };
    expect(t.n).toBe(1);

    db.close();
  });
});
