// @vitest-environment node
import Database from "better-sqlite3";
import { describe, it, expect, beforeEach } from "vitest";
import { initSchema } from "@/lib/db-schema";
import {
  createSpace,
  addSpaceMember,
  getSpacesForUser,
  getSpaceDefaultLabels,
  isSpaceMember,
  filterBySpace,
  resolveSpaceId,
} from "@/lib/space";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

describe("space.ts (Phase 130 / TEAMSCALE-01)", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
  });

  it("createSpace returns a Space with id, name, and default labels", () => {
    const space = createSpace(db, {
      tenantId: "default-tenant",
      name: "growth",
      defaultLabels: { sensitivity: "internal", authoritative: true },
    });
    expect(space.id).toMatch(/^spc_/);
    expect(space.name).toBe("growth");
    expect(space.tenantId).toBe("default-tenant");
    expect(space.defaultLabels).toEqual({
      sensitivity: "internal",
      authoritative: true,
    });
    expect(space.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("createSpace defaults labels to {} when not provided", () => {
    const space = createSpace(db, {
      tenantId: "default-tenant",
      name: "minimal",
    });
    expect(space.defaultLabels).toEqual({});
  });

  it("createSpace rejects duplicate (tenant_id, name) -- hard guard", () => {
    createSpace(db, { tenantId: "default-tenant", name: "dupe" });
    expect(() =>
      createSpace(db, { tenantId: "default-tenant", name: "dupe" }),
    ).toThrow(/already exists/);
  });

  it("addSpaceMember + isSpaceMember works for humans and agents", () => {
    const space = createSpace(db, {
      tenantId: "default-tenant",
      name: "team-a",
    });
    addSpaceMember(db, {
      spaceId: space.id,
      memberId: "user-1",
      memberType: "human",
      role: "admin",
    });
    addSpaceMember(db, {
      spaceId: space.id,
      memberId: "agent-1",
      memberType: "agent",
    });

    expect(isSpaceMember(db, space.id, "user-1")).toBe(true);
    expect(isSpaceMember(db, space.id, "agent-1")).toBe(true);
    expect(isSpaceMember(db, space.id, "stranger")).toBe(false);
    // Unknown space -> false
    expect(isSpaceMember(db, "spc_doesnotexist", "user-1")).toBe(false);
  });

  it("addSpaceMember is idempotent on (space_id, member_id)", () => {
    const space = createSpace(db, {
      tenantId: "default-tenant",
      name: "team-b",
    });
    addSpaceMember(db, {
      spaceId: space.id,
      memberId: "user-1",
      memberType: "human",
      role: "member",
    });
    addSpaceMember(db, {
      spaceId: space.id,
      memberId: "user-1",
      memberType: "human",
      role: "admin",
    });
    // Still one row, role updated to admin.
    const rows = db
      .prepare("SELECT role FROM space_members WHERE member_id = ?")
      .all("user-1") as { role: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("admin");
  });

  it("getSpacesForUser returns only spaces the user belongs to (no cross-space leakage)", () => {
    const a = createSpace(db, { tenantId: "default-tenant", name: "alpha" });
    const b = createSpace(db, { tenantId: "default-tenant", name: "beta" });
    const c = createSpace(db, { tenantId: "default-tenant", name: "gamma" });

    addSpaceMember(db, { spaceId: a.id, memberId: "user-1", memberType: "human" });
    addSpaceMember(db, { spaceId: b.id, memberId: "user-1", memberType: "human" });
    // user-1 is NOT in gamma.
    addSpaceMember(db, { spaceId: c.id, memberId: "user-2", memberType: "human" });

    const user1Spaces = getSpacesForUser(db, "user-1");
    expect(user1Spaces.map((s) => s.name).sort()).toEqual(["alpha", "beta"]);

    const user2Spaces = getSpacesForUser(db, "user-2");
    expect(user2Spaces.map((s) => s.name)).toEqual(["gamma"]);

    // No rows for a non-member.
    expect(getSpacesForUser(db, "stranger")).toEqual([]);
  });

  it("getSpaceDefaultLabels round-trips through JSON", () => {
    const space = createSpace(db, {
      tenantId: "default-tenant",
      name: "labels-rt",
      defaultLabels: {
        sensitivity: "confidential",
        authoritative: false,
        expires_at: "2099-01-01",
        nested: { ok: true },
      },
    });
    const labels = getSpaceDefaultLabels(db, space.id);
    expect(labels.sensitivity).toBe("confidential");
    expect(labels.authoritative).toBe(false);
    expect(labels.expires_at).toBe("2099-01-01");
    expect((labels.nested as { ok: boolean }).ok).toBe(true);
  });

  it("filterBySpace filters by project name (backward compat for rows without space_id)", () => {
    const rows = [
      { id: 1, project: "growth", space_id: null },
      { id: 2, project: "growth", space_id: null },
      { id: 3, project: "other", space_id: null },
      { id: 4, project: "growth", space_id: "spc_growth" }, // new-style row
    ];
    const out = filterBySpace(rows, "growth");
    expect(out.map((r) => r.id)).toEqual([1, 2, 4]);
  });

  it("filterBySpace matches by space_id when both id and name match", () => {
    const space = createSpace(db, {
      tenantId: "default-tenant",
      name: "newname",
    });
    const rows = [
      { id: 1, project: "oldname", space_id: space.id },
      { id: 2, project: "newname", space_id: null }, // legacy fallback
      { id: 3, project: "oldname", space_id: null },  // not a match
    ];
    const out = filterBySpace(rows, "newname", space.id);
    expect(out.map((r) => r.id).sort()).toEqual([1, 2]);
  });

  it("resolveSpaceId looks up by (tenant_id, name)", () => {
    const space = createSpace(db, {
      tenantId: "default-tenant",
      name: "lookup-me",
    });
    expect(resolveSpaceId(db, "default-tenant", "lookup-me")).toBe(space.id);
    expect(resolveSpaceId(db, "default-tenant", "missing")).toBeNull();
    // Empty name -> null (don't fall back to a wrong row).
    expect(resolveSpaceId(db, "default-tenant", "")).toBeNull();
  });
});