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
