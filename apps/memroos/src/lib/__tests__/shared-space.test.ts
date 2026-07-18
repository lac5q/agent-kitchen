// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { initSchema } from "@/lib/db-schema";
import { createSpace } from "@/lib/space";
import {
  setSpaceShared,
  isSpaceShared,
  assertWritableSpace,
  assertReadableSpace,
  getSharedToggleHistory,
} from "@/lib/shared-space";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

function setup(): {
  db: Database.Database;
  spaceId: string;
  secondSpaceId: string;
  actorId: string;
} {
  const db = freshDb();
  const space = createSpace(db, { tenantId: "default-tenant", name: "growth" });
  const secondSpace = createSpace(db, { tenantId: "default-tenant", name: "ops" });
  const actorId = "user-1";
  return {
    db,
    spaceId: space.id,
    secondSpaceId: secondSpace.id,
    actorId,
  };
}

function countAuditRows(db: Database.Database, eventType: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM audit_entries WHERE event_type = ?")
    .get(eventType) as { n: number };
  return row.n;
}

describe("shared-space.ts (Phase 139 / SHAREDRO-01..03)", () => {
  let db: Database.Database;
  let spaceId: string;
  let secondSpaceId: string;
  let actorId: string;

  beforeEach(() => {
    ({ db, spaceId, secondSpaceId, actorId } = setup());
  });

  it("1) isSpaceShared returns false for a fresh space (default is_shared=0)", () => {
    expect(isSpaceShared(db, spaceId)).toBe(false);
  });

  it("2) isSpaceShared returns false for an unknown space id", () => {
    expect(isSpaceShared(db, "spc_does_not_exist")).toBe(false);
  });

  it("3) setSpaceShared turning ON marks the space shared and isSpaceShared returns true", () => {
    setSpaceShared(db, { spaceId, isShared: true, actorId, reason: "cross-team review" });
    expect(isSpaceShared(db, spaceId)).toBe(true);
  });

  it("4) setSpaceShared turning OFF requires a reason (SHAREDRO-03)", () => {
    setSpaceShared(db, { spaceId, isShared: true, actorId, reason: "review complete" });
    expect(() =>
      setSpaceShared(db, { spaceId, isShared: false, actorId }),
    ).toThrow(/SHAREDRO-03/);
  });

  it("5) setSpaceShared turning OFF with a reason restores writable state", () => {
    setSpaceShared(db, { spaceId, isShared: true, actorId, reason: "review complete" });
    expect(isSpaceShared(db, spaceId)).toBe(true);
    setSpaceShared(db, { spaceId, isShared: false, actorId, reason: "ownership reclaimed" });
    expect(isSpaceShared(db, spaceId)).toBe(false);
  });

  it("6) setSpaceShared writes a space.shared_toggle audit row", () => {
    expect(countAuditRows(db, "space.shared_toggle")).toBe(0);
    setSpaceShared(db, { spaceId, isShared: true, actorId, reason: "review" });
    expect(countAuditRows(db, "space.shared_toggle")).toBe(1);
    const row = db
      .prepare("SELECT metadata_json, actor_id FROM audit_entries WHERE event_type = ?")
      .get("space.shared_toggle") as { metadata_json: string; actor_id: string };
    expect(row.actor_id).toBe(actorId);
    const meta = JSON.parse(row.metadata_json);
    expect(meta.actionType).toBe("space.shared_toggle");
    expect(meta.isShared).toBe(true);
    expect(meta.reason).toBe("review");
  });

  it("7) assertWritableSpace throws when space is shared (SHAREDRO-01)", () => {
    setSpaceShared(db, { spaceId, isShared: true, actorId, reason: "review" });
    expect(() => assertWritableSpace(db, spaceId)).toThrow(/SHAREDRO-01/);
  });

  it("8) assertWritableSpace does not throw when space is not shared", () => {
    expect(() => assertWritableSpace(db, spaceId)).not.toThrow();
  });

  it("9) assertWritableSpace throws when space not found", () => {
    expect(() => assertWritableSpace(db, "spc_missing")).toThrow(/space not found/);
  });

  it("10) assertReadableSpace writes a space.shared_read receipt for shared spaces (SHAREDRO-02)", () => {
    expect(countAuditRows(db, "space.shared_read")).toBe(0);
    // Not shared -> no receipt.
    assertReadableSpace(db, { spaceId, actorId });
    expect(countAuditRows(db, "space.shared_read")).toBe(0);

    setSpaceShared(db, { spaceId, isShared: true, actorId, reason: "review" });
    assertReadableSpace(db, { spaceId, actorId });
    expect(countAuditRows(db, "space.shared_read")).toBe(1);
    const row = db
      .prepare("SELECT metadata_json FROM audit_entries WHERE event_type = ?")
      .get("space.shared_read") as { metadata_json: string };
    const meta = JSON.parse(row.metadata_json);
    expect(meta.actionType).toBe("space.shared_read");
    expect(meta.spaceId).toBe(spaceId);
    expect(meta.actorId).toBe(actorId);
    expect(meta.isShared).toBe(true);
  });

  it("11) assertReadableSpace throws when spaceId or actorId is missing", () => {
    expect(() => assertReadableSpace(db, { spaceId: "", actorId })).toThrow(/spaceId/);
    expect(() => assertReadableSpace(db, { spaceId, actorId: "" })).toThrow(/actorId/);
  });

  it("12) getSharedToggleHistory returns toggle events newest-first", async () => {
    expect(getSharedToggleHistory(db, spaceId)).toEqual([]);
    setSpaceShared(db, { spaceId, isShared: true, actorId, reason: "review" });
    // Yield so the second toggle gets a distinct created_at timestamp.
    await new Promise((r) => setTimeout(r, 5));
    setSpaceShared(db, { spaceId, isShared: false, actorId, reason: "reclaimed" });
    const history = getSharedToggleHistory(db, spaceId);
    expect(history.length).toBe(2);
    // Newest first: the OFF toggle is most recent.
    expect(history[0].isShared).toBe(false);
    expect(history[0].reason).toBe("reclaimed");
    expect(history[1].isShared).toBe(true);
    expect(history[1].reason).toBe("review");
    // actorId and timestamp present on each entry.
    for (const entry of history) {
      expect(entry.actorId).toBe(actorId);
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("13) getSharedToggleHistory is scoped to the requested space", () => {
    setSpaceShared(db, { spaceId, isShared: true, actorId, reason: "review" });
    setSpaceShared(db, { spaceId: secondSpaceId, isShared: true, actorId, reason: "other" });
    const history = getSharedToggleHistory(db, spaceId);
    expect(history.length).toBe(1);
    expect(history[0].isShared).toBe(true);
  });

  it("14) setSpaceShared throws for an unknown space id", () => {
    expect(() =>
      setSpaceShared(db, { spaceId: "spc_missing", isShared: true, actorId }),
    ).toThrow(/not found/);
  });

  it("15) validates blank toggle inputs and tolerates corrupt history metadata", () => {
    expect(() => setSpaceShared(db, { spaceId: "  ", isShared: true, actorId })).toThrow(/spaceId/);
    expect(() => setSpaceShared(db, { spaceId, isShared: true, actorId: " " })).toThrow(/actorId/);

    db.prepare(
      `INSERT INTO audit_entries
         (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, metadata_json, created_at)
       VALUES ('corrupt-toggle', 'default-tenant', ?, 'operator', 'space.shared_toggle', 'space', ?, ?, ?)`
    ).run(actorId, `space:${spaceId}`, "{not-json", "2026-07-18T10:00:00.000Z");

    expect(getSharedToggleHistory(db, " ")).toEqual([]);
    expect(getSharedToggleHistory(db, spaceId)).toContainEqual(
      expect.objectContaining({
        actorId,
        isShared: false,
        reason: null,
      })
    );
  });
});
