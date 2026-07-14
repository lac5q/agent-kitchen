import crypto from "crypto";
import type Database from "better-sqlite3";

/**
 * Phase 130 / TEAMSCALE-01: teams + spaces.
 *
 * A Space is a tenant-scoped container of human + agent members. Conversations
 * (`messages.space_id`) are scoped to a space so the conversation store can be
 * filtered per-team without touching the existing `project` column.
 *
 * Existing rows remain valid because `space_id` is nullable; `filterBySpace`
 * falls back to matching `project` by space name for backward compat.
 */

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

interface SpaceRow {
  id: string;
  tenant_id: string;
  name: string;
  default_labels_json: string;
  created_at: string;
}

function generateSpaceId(): string {
  // crypto.randomUUID is available in Node 16.7+; fall back to a sha256 if not.
  if (typeof crypto.randomUUID === "function") {
    return `spc_${crypto.randomUUID()}`;
  }
  const rand = crypto.randomBytes(16).toString("hex");
  return `spc_${rand}`;
}

function rowToSpace(row: SpaceRow): Space {
  let labels: Record<string, unknown> = {};
  if (row.default_labels_json && row.default_labels_json.trim().length > 0) {
    try {
      const parsed = JSON.parse(row.default_labels_json);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        labels = parsed as Record<string, unknown>;
      }
    } catch {
      // Corrupt JSON -- default to empty labels rather than throwing, since
      // a read should never break the caller. The next write repairs the row.
      labels = {};
    }
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    defaultLabels: labels,
    createdAt: row.created_at,
  };
}

/**
 * Create a new space in the given tenant. Throws if (tenant_id, name) is
 * already taken (the unique index is the enforcement; we surface a clean error).
 */
export function createSpace(
  db: Database.Database,
  input: {
    tenantId: string;
    name: string;
    defaultLabels?: Record<string, unknown>;
  },
): Space {
  const tenantId = (input.tenantId || "default-tenant").trim() || "default-tenant";
  const name = (input.name || "").trim();
  if (!name) {
    throw new Error("createSpace: name is required");
  }
  const id = generateSpaceId();
  const labels = input.defaultLabels ?? {};
  try {
    db.prepare(
      `INSERT INTO spaces (id, tenant_id, name, default_labels_json)
       VALUES (?, ?, ?, ?)`,
    ).run(id, tenantId, name, JSON.stringify(labels));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE") || msg.includes("unique")) {
      throw new Error(
        `createSpace: a space named '${name}' already exists in tenant '${tenantId}'`,
      );
    }
    throw err;
  }

  // Read back so we return the canonical row (including created_at default).
  const row = db
    .prepare(
      `SELECT id, tenant_id, name, default_labels_json, created_at
       FROM spaces WHERE id = ?`,
    )
    .get(id) as SpaceRow | undefined;
  if (!row) {
    // Should never happen -- we just inserted -- but be defensive.
    throw new Error(`createSpace: inserted row ${id} not found on read-back`);
  }
  return rowToSpace(row);
}

/**
 * Add a human or agent member to a space. Idempotent: re-adding the same
 * (space_id, member_id) with a different role updates the role in place.
 */
export function addSpaceMember(
  db: Database.Database,
  input: {
    spaceId: string;
    memberId: string;
    memberType: "human" | "agent";
    role?: string;
  },
): void {
  const spaceId = (input.spaceId || "").trim();
  const memberId = (input.memberId || "").trim();
  const memberType = input.memberType;
  const role = (input.role ?? "member").trim() || "member";
  if (!spaceId) throw new Error("addSpaceMember: spaceId is required");
  if (!memberId) throw new Error("addSpaceMember: memberId is required");
  if (memberType !== "human" && memberType !== "agent") {
    throw new Error(
      `addSpaceMember: memberType must be 'human' or 'agent' (got '${memberType}')`,
    );
  }

  // Upsert: keep one row per (space_id, member_id). If the member already
  // exists with a different role, update the role.
  const existing = db
    .prepare(
      `SELECT role FROM space_members WHERE space_id = ? AND member_id = ?`,
    )
    .get(spaceId, memberId) as { role: string } | undefined;
  if (existing) {
    if (existing.role !== role) {
      db.prepare(
        `UPDATE space_members SET role = ? WHERE space_id = ? AND member_id = ?`,
      ).run(role, spaceId, memberId);
    }
    return;
  }
  db.prepare(
    `INSERT INTO space_members (space_id, member_id, member_type, role)
     VALUES (?, ?, ?, ?)`,
  ).run(spaceId, memberId, memberType, role);
}

/**
 * Return all spaces the given member belongs to. Always returns an array
 * (empty if none). Order is deterministic (created_at ASC, name ASC) so
 * tests can assert exact contents.
 */
export function getSpacesForUser(
  db: Database.Database,
  userId: string,
): Space[] {
  const memberId = (userId || "").trim();
  if (!memberId) return [];
  const rows = db
    .prepare(
      `SELECT s.id, s.tenant_id, s.name, s.default_labels_json, s.created_at
       FROM spaces s
       INNER JOIN space_members sm ON sm.space_id = s.id
       WHERE sm.member_id = ?
       ORDER BY s.created_at ASC, s.name ASC`,
    )
    .all(memberId) as SpaceRow[];
  return rows.map(rowToSpace);
}

/**
 * Return the default labels JSON for a space, parsed into a dict. Empty
 * dict if the space is missing or labels JSON is corrupt.
 */
export function getSpaceDefaultLabels(
  db: Database.Database,
  spaceId: string,
): Record<string, unknown> {
  const row = db
    .prepare(
      `SELECT default_labels_json FROM spaces WHERE id = ?`,
    )
    .get(spaceId) as { default_labels_json: string } | undefined;
  if (!row) return {};
  if (!row.default_labels_json) return {};
  try {
    const parsed = JSON.parse(row.default_labels_json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Check if a member is part of the given space. Returns false for unknown
 * spaces and unknown members.
 */
export function isSpaceMember(
  db: Database.Database,
  spaceId: string,
  memberId: string,
): boolean {
  if (!spaceId || !memberId) return false;
  const row = db
    .prepare(
      `SELECT 1 AS one FROM space_members WHERE space_id = ? AND member_id = ? LIMIT 1`,
    )
    .get(spaceId, memberId) as { one: number } | undefined;
  return row !== undefined;
}

/**
 * Filter message-like rows to those belonging to a space.
 *
 * The lookup order is:
 *   1. If `spaceId` is provided AND the row has `space_id`, match on `space_id`.
 *      (Caller passes the resolved id of the space -- see `resolveSpaceId`.)
 *   2. Otherwise, fall back to matching the legacy `project` column by name.
 *
 * This keeps existing rows (no space_id) visible to the space they were
 * already associated with via `project`, while letting new code write the
 * proper id directly.
 *
 * `spaceName` is used for the project-name fallback AND for callers that
 * don't have the id resolved yet. The helper is intentionally permissive:
 * a row passes if either gate matches, which mirrors the rule that a space
 * represents one project (or one project renamed).
 */
export function filterBySpace<
  T extends { space_id?: string | null; project?: string | null },
>(rows: T[], spaceName: string, spaceId?: string | null): T[] {
  const target = (spaceName || "").trim();
  if (!target) return rows;
  return rows.filter((row) => {
    // New-style: id matches the row's space_id column.
    if (
      spaceId &&
      row.space_id !== undefined &&
      row.space_id !== null &&
      row.space_id === spaceId
    ) {
      return true;
    }
    // Legacy: row has no space_id, project name matches the space name.
    if (row.project !== undefined && row.project !== null) {
      return row.project === target;
    }
    return false;
  });
}

/**
 * Resolve a space id from a (tenantId, name) pair. Returns null if not found.
 * Useful for callers that have a space name but want to set messages.space_id.
 */
export function resolveSpaceId(
  db: Database.Database,
  tenantId: string,
  name: string,
): string | null {
  const tid = (tenantId || "").trim() || "default-tenant";
  const nm = (name || "").trim();
  if (!nm) return null;
  const row = db
    .prepare(
      `SELECT id FROM spaces WHERE tenant_id = ? AND name = ? LIMIT 1`,
    )
    .get(tid, nm) as { id: string } | undefined;
  return row ? row.id : null;
}