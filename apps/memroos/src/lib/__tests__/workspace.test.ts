// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { initSchema } from "@/lib/db-schema";
import { createSpace, addSpaceMember } from "@/lib/space";
import {
  loadWorkspace,
  getActiveWorkspace,
  clearWorkspace,
  promptWorkspaceSelection,
  assertWorkspaceForHeadless,
  isWriteTargetInWorkspace,
  recordCrossSpaceRead,
} from "@/lib/workspace";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

function setupWorkspace(): {
  db: Database.Database;
  spaceId: string;
  secondSpaceId: string;
  actorId: string;
} {
  const db = freshDb();
  const space = createSpace(db, { tenantId: "default-tenant", name: "growth" });
  const secondSpace = createSpace(db, { tenantId: "default-tenant", name: "ops" });
  const actorId = "user-1";
  addSpaceMember(db, { spaceId: space.id, memberId: actorId, memberType: "human" });
  addSpaceMember(db, { spaceId: secondSpace.id, memberId: actorId, memberType: "human" });
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

describe("workspace.ts (Phase 137 / WORKLOAD-01..05)", () => {
  let db: Database.Database;
  let spaceId: string;
  let secondSpaceId: string;
  let actorId: string;

  beforeEach(() => {
    ({ db, spaceId, secondSpaceId, actorId } = setupWorkspace());
  });

  it("1) loadWorkspace creates an active workspace; getActiveWorkspace returns it", () => {
    const ws = loadWorkspace(db, { spaceId, actorId });
    expect(ws.spaceId).toBe(spaceId);
    expect(ws.spaceName).toBe("growth");
    expect(ws.loadedBy).toBe(actorId);
    expect(ws.isHeadless).toBe(false);
    expect(ws.loadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const active = getActiveWorkspace(db);
    expect(active).not.toBeNull();
    expect(active?.spaceId).toBe(spaceId);
    expect(active?.spaceName).toBe("growth");
    expect(active?.isHeadless).toBe(false);
  });

  it("2) Loading a new space replaces the previous active workspace (only one active)", () => {
    loadWorkspace(db, { spaceId, actorId });
    const first = getActiveWorkspace(db);
    expect(first?.spaceId).toBe(spaceId);

    loadWorkspace(db, { spaceId: secondSpaceId, actorId });
    const second = getActiveWorkspace(db);
    expect(second?.spaceId).toBe(secondSpaceId);
    expect(second?.spaceName).toBe("ops");

    // At most one row with cleared_at IS NULL.
    const activeCount = db
      .prepare(
        "SELECT COUNT(*) AS n FROM active_workspace WHERE cleared_at IS NULL"
      )
      .get() as { n: number };
    expect(activeCount.n).toBe(1);
    // The previously-active row now has cleared_at set.
    const clearedCount = db
      .prepare("SELECT COUNT(*) AS n FROM active_workspace WHERE cleared_at IS NOT NULL")
      .get() as { n: number };
    expect(clearedCount.n).toBe(1);
  });

  it("3) clearWorkspace clears the active workspace; getActiveWorkspace returns null", () => {
    loadWorkspace(db, { spaceId, actorId });
    expect(getActiveWorkspace(db)).not.toBeNull();
    clearWorkspace(db);
    expect(getActiveWorkspace(db)).toBeNull();
    // clearWorkspace is a no-op when nothing is loaded.
    clearWorkspace(db);
    expect(getActiveWorkspace(db)).toBeNull();
  });

  it("4) promptWorkspaceSelection returns needsSelection=true with available spaces when none active", () => {
    const result = promptWorkspaceSelection(db, actorId);
    expect(result.needsSelection).toBe(true);
    expect(result.availableSpaces.map((s) => s.name).sort()).toEqual(["growth", "ops"]);
  });

  it("5) promptWorkspaceSelection returns needsSelection=false when workspace is active", () => {
    loadWorkspace(db, { spaceId, actorId });
    const result = promptWorkspaceSelection(db, actorId);
    expect(result.needsSelection).toBe(false);
    expect(result.availableSpaces).toEqual([]);
  });

  it("6) assertWorkspaceForHeadless throws when no active workspace (WORKLOAD-04 fail-closed)", () => {
    expect(() => assertWorkspaceForHeadless(db)).toThrow(/WORKLOAD-04/);
  });

  it("7) assertWorkspaceForHeadless returns the active workspace when one is loaded", () => {
    const ws = loadWorkspace(db, { spaceId, actorId, isHeadless: true });
    const asserted = assertWorkspaceForHeadless(db);
    expect(asserted.spaceId).toBe(ws.spaceId);
    expect(asserted.isHeadless).toBe(true);
  });

  it("8) isWriteTargetInWorkspace returns true for matching space, false for non-matching or unloaded", () => {
    // No active workspace -> false everywhere.
    expect(isWriteTargetInWorkspace(db, spaceId)).toBe(false);

    loadWorkspace(db, { spaceId, actorId });
    expect(isWriteTargetInWorkspace(db, spaceId)).toBe(true);
    expect(isWriteTargetInWorkspace(db, secondSpaceId)).toBe(false);
  });

  it("9) recordCrossSpaceRead writes a workspace.cross_space_read audit row", () => {
    expect(countAuditRows(db, "workspace.cross_space_read")).toBe(0);
    recordCrossSpaceRead(db, {
      fromSpaceId: spaceId,
      toSpaceId: secondSpaceId,
      actorId,
      policyReceiptId: "rcpt_abc123",
    });
    expect(countAuditRows(db, "workspace.cross_space_read")).toBe(1);

    const row = db
      .prepare(
        "SELECT metadata_json, actor_id FROM audit_entries WHERE event_type = ?"
      )
      .get("workspace.cross_space_read") as {
        metadata_json: string;
        actor_id: string;
      };
    expect(row.actor_id).toBe(actorId);
    const meta = JSON.parse(row.metadata_json);
    expect(meta.actionType).toBe("workspace.cross_space_read");
    expect(meta.fromSpaceId).toBe(spaceId);
    expect(meta.toSpaceId).toBe(secondSpaceId);
    expect(meta.policyReceiptId).toBe("rcpt_abc123");
  });

  it("10) loadWorkspace writes a workspace.loaded audit row", () => {
    expect(countAuditRows(db, "workspace.loaded")).toBe(0);
    loadWorkspace(db, { spaceId, actorId, isHeadless: true });
    expect(countAuditRows(db, "workspace.loaded")).toBe(1);
    const row = db
      .prepare(
        "SELECT metadata_json FROM audit_entries WHERE event_type = ?"
      )
      .get("workspace.loaded") as { metadata_json: string };
    const meta = JSON.parse(row.metadata_json);
    expect(meta.actionType).toBe("workspace.loaded");
    expect(meta.spaceId).toBe(spaceId);
    expect(meta.isHeadless).toBe(true);
  });
});
