// @vitest-environment node
//
// REGRESSION: messages_fts lost every term common to a row's old and new
// content whenever an indexed row was rewritten.
//
// The schema used to declare two separate AFTER UPDATE triggers — one issuing
// the FTS 'delete' for the old values, one inserting the new. SQLite does not
// guarantee their relative order, and in practice the insert ran first, so the
// paired delete stripped the tokens that had just been written. Terms unique to
// the new content survived, which is what made it invisible: the index looked
// populated and returned plausible results while quietly missing rows.
//
// Found on cordant-hermes-01 once connector rows started being rewritten: a
// Notion page stored as its URL and later enriched with its real body matched
// 'colleagues' (new only) but not 'Teamspace' or 'Home' (in both). It affects
// any connector record edited upstream, not just Notion.

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { initSchema } from "@/lib/db-schema";

function ftsRowIds(db: Database.Database, term: string): number[] {
  return (
    db
      .prepare("SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?")
      .all(term) as Array<{ rowid: number }>
  ).map((r) => r.rowid);
}

function insertIndexable(db: Database.Database, id: number, content: string) {
  db.prepare(
    `INSERT INTO messages (id, session_id, project, agent_id, role, content, timestamp, visibility, policy)
     VALUES (?, 'notion:c1', 'connector/notion', 'connector:notion', 'connector', ?, '2026-07-29T00:00:00Z', 'internal', 'indexable')`
  ).run(id, content);
}

describe("messages_fts stays correct when an indexed row is rewritten", () => {
  it("keeps terms present in BOTH the old and new content", () => {
    const db = new Database(":memory:");
    initSchema(db);

    // Old content: the URL-only form, whose slug contains "Teamspace"/"Home".
    insertIndexable(db, 1, "https://app.notion.com/p/Teamspace-Home-abc123");
    // New content: the enriched body, which also contains both terms.
    db.prepare("UPDATE messages SET content = ? WHERE id = 1").run(
      "Teamspace Home\n\nGive your colleagues a place to learn about your team."
    );

    // Present in both old and new — these are the ones that used to vanish.
    expect(ftsRowIds(db, "Teamspace")).toEqual([1]);
    expect(ftsRowIds(db, "Home")).toEqual([1]);
    // Present only in the new content — survived even under the old bug, so
    // asserting only this would have let the regression through.
    expect(ftsRowIds(db, "colleagues")).toEqual([1]);

    db.close();
  });

  it("drops terms that existed only in the old content", () => {
    const db = new Database(":memory:");
    initSchema(db);

    insertIndexable(db, 1, "https://app.notion.com/p/Teamspace-Home-abc123");
    db.prepare("UPDATE messages SET content = ? WHERE id = 1").run("Teamspace Home only.");

    // The stale index would keep matching the URL forever.
    expect(ftsRowIds(db, "notion")).toEqual([]);
    expect(ftsRowIds(db, "app")).toEqual([]);

    db.close();
  });

  it("removes a row from the index when it stops being indexable", () => {
    const db = new Database(":memory:");
    initSchema(db);

    insertIndexable(db, 1, "Teamspace Home sensitive body");
    expect(ftsRowIds(db, "sensitive")).toEqual([1]);

    // Re-labelling to sealed must retract it from search.
    db.prepare("UPDATE messages SET policy = 'sealed', visibility = 'private' WHERE id = 1").run();
    expect(ftsRowIds(db, "sensitive")).toEqual([]);

    db.close();
  });

  it("adds a row to the index when it becomes indexable", () => {
    const db = new Database(":memory:");
    initSchema(db);

    db.prepare(
      `INSERT INTO messages (id, session_id, project, agent_id, role, content, timestamp, visibility, policy)
       VALUES (1, 'notion:c1', 'connector/notion', 'connector:notion', 'connector', 'Teamspace body', '2026-07-29T00:00:00Z', 'private', 'sealed')`
    ).run();
    expect(ftsRowIds(db, "Teamspace")).toEqual([]);

    db.prepare(
      "UPDATE messages SET policy = 'indexable', visibility = 'internal' WHERE id = 1"
    ).run();
    expect(ftsRowIds(db, "Teamspace")).toEqual([1]);

    db.close();
  });

  it("migration repairs a database already stamped at the old version", () => {
    // The failure this catches: the trigger DDL lives in the main schema body,
    // which only re-runs for a DB below its migration version. Editing that
    // DDL in place fixes fresh databases and silently leaves every deployed
    // one broken — observed on cordant-hermes-01, where the rebuild never ran
    // and the old triggers stayed in place after a full redeploy.
    const db = new Database(":memory:");
    initSchema(db);

    // Recreate the pre-migration state: old two-trigger scheme, and a DB
    // stamped below the migration that fixes it.
    db.exec(`
      DROP TRIGGER IF EXISTS messages_au;
      CREATE TRIGGER messages_au_delete AFTER UPDATE ON messages
      WHEN old.policy = 'indexable' AND old.visibility IN ('internal','public_safe','public_approved')
      BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content, project, timestamp, agent_id)
        VALUES('delete', old.id, old.content, old.project, old.timestamp, old.agent_id);
      END;
      CREATE TRIGGER messages_au_insert AFTER UPDATE ON messages
      WHEN new.policy = 'indexable' AND new.visibility IN ('internal','public_safe','public_approved')
      BEGIN
        INSERT INTO messages_fts(rowid, content, project, timestamp, agent_id)
        VALUES (new.id, new.content, new.project, new.timestamp, new.agent_id);
      END;
    `);
    db.pragma("user_version = 32");

    insertIndexable(db, 1, "https://app.notion.com/p/Teamspace-Home-abc123");
    db.prepare("UPDATE messages SET content = ? WHERE id = 1").run(
      "Teamspace Home\n\nGive your colleagues a place."
    );
    // Damaged, as in production.
    expect(ftsRowIds(db, "Teamspace")).toEqual([]);

    // Re-running initSchema must migrate and repair.
    initSchema(db);
    expect(ftsRowIds(db, "Teamspace")).toEqual([1]);
    expect(ftsRowIds(db, "colleagues")).toEqual([1]);
    // And the stale URL tokens are gone.
    expect(ftsRowIds(db, "notion")).toEqual([]);

    db.close();
  });

  it("repair does not expose sealed or private rows", () => {
    // A bare FTS 'rebuild' would index every row regardless of label, turning
    // an index repair into a disclosure. The projection must keep the same
    // predicate the triggers use.
    const db = new Database(":memory:");
    initSchema(db);

    db.prepare(
      `INSERT INTO messages (id, session_id, project, agent_id, role, content, timestamp, visibility, policy)
       VALUES (1, 's', 'p', 'a', 'user', 'sealedsecret material', '2026-07-29T00:00:00Z', 'private', 'sealed')`
    ).run();
    insertIndexable(db, 2, "public indexable material");

    db.pragma("user_version = 32");
    initSchema(db);

    expect(ftsRowIds(db, "sealedsecret")).toEqual([]);
    expect(ftsRowIds(db, "indexable")).toEqual([2]);

    db.close();
  });

  it("passes FTS5 integrity-check after a rewrite", () => {
    const db = new Database(":memory:");
    initSchema(db);

    insertIndexable(db, 1, "https://app.notion.com/p/Teamspace-Home-abc123");
    db.prepare("UPDATE messages SET content = ? WHERE id = 1").run("Teamspace Home rewritten.");

    // Throws if the external-content index and the table have diverged.
    expect(() =>
      db.exec("INSERT INTO messages_fts(messages_fts) VALUES('integrity-check')")
    ).not.toThrow();

    db.close();
  });
});
