import { NextRequest } from "next/server";

import { getDb } from "@/lib/db";
import { authenticateUser } from "@/lib/auth/session";
import { ROLE_RANK, requireRole } from "@/lib/auth/middleware-roles";
import type { UserRole } from "@/lib/auth/types";
import { writeAuditLogFromEntry } from "@/lib/store/audit";

export const dynamic = "force-dynamic";

/**
 * Remove a person from the team.
 *
 * Disable is the default and DELETE is opt-in, because nine tables reference
 * users(id) and two of them — hil_escalations and owner_gate_approvals — are
 * approval records. Cascading those away destroys the evidence of who approved
 * what, which is the opposite of what an offboarding usually wants.
 *
 * Disable is also the reversible option, and `disabled_at` is already enforced
 * on every authentication path (password login, session refresh, Google OIDC),
 * so setting it takes effect immediately.
 */

const ASSIGNABLE_ROLES: UserRole[] = ["reviewer", "operator", "admin"];

function isAssignableRole(value: unknown): value is UserRole {
  return typeof value === "string" && (ASSIGNABLE_ROLES as string[]).includes(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Refuse to remove the last admin — otherwise nobody can administer anything. */
function wouldOrphanAdmins(db: ReturnType<typeof getDb>, targetUserId: string): boolean {
  const targetIsAdmin = db
    .prepare("SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'admin'")
    .get(targetUserId);
  if (!targetIsAdmin) return false;

  const remaining = db
    .prepare(
      `SELECT COUNT(*) AS n FROM user_roles r
       JOIN users u ON u.id = r.user_id
       WHERE r.role = 'admin' AND u.disabled_at IS NULL AND r.user_id != ?`
    )
    .get(targetUserId) as { n: number };
  return remaining.n === 0;
}

/** Cut off everything the person could still act with. */
function revokeCredentials(db: ReturnType<typeof getDb>, userId: string): void {
  const stamp = nowIso();
  db.prepare("DELETE FROM user_refresh_tokens WHERE user_id = ?").run(userId);
  db.prepare("UPDATE user_api_keys SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(stamp, userId);
  // MCP OAuth tokens exist only once migration 35 has run.
  try {
    db.prepare("UPDATE mcp_oauth_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(stamp, userId);
  } catch {
    /* table not present on an older schema — nothing to revoke */
  }
}

async function authorize(req: NextRequest, targetUserId: string) {
  const session = await authenticateUser(req);
  if (!session) return { error: Response.json({ error: "authentication required" }, { status: 401 }) };

  const roleError = requireRole(session.role, "admin");
  if (roleError) return { error: roleError };

  // Self-removal is refused rather than merely discouraged: an admin who
  // disables themselves mid-session can be left unable to undo it.
  if (session.userId === targetUserId) {
    return {
      error: Response.json(
        { error: "cannot modify your own account", detail: "ask another admin to do this" },
        { status: 400 }
      ),
    };
  }
  return { session };
}

/** PATCH — disable or re-enable. The reversible path, and the default. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const { userId } = await ctx.params;
  const auth = await authorize(req, userId);
  if (auth.error) return auth.error;

  let body: { disabled?: unknown; role?: unknown };
  try {
    body = (await req.json()) as { disabled?: unknown; role?: unknown };
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }
  const wantsRole = body.role !== undefined;
  if (!wantsRole && typeof body.disabled !== "boolean") {
    return Response.json({ error: "disabled must be a boolean" }, { status: 400 });
  }

  const db = getDb();
  const target = db.prepare("SELECT id, email, disabled_at FROM users WHERE id = ?").get(userId) as
    | { id: string; email: string; disabled_at: string | null }
    | undefined;
  if (!target) return Response.json({ error: "user not found" }, { status: 404 });

  /**
   * Role change.
   *
   * `user_roles` is keyed on (user_id, role), so it can hold several rows per
   * person — but the console shows one role and `requireRole` compares one rank.
   * A change therefore replaces rather than adds, or the UI and the check could
   * disagree about who someone is.
   */
  if (wantsRole) {
    if (!isAssignableRole(body.role)) {
      return Response.json(
        { error: "role must be one of: reviewer, operator, admin" },
        { status: 400 }
      );
    }
    const nextRole = body.role;
    const currentRole = (
      db.prepare("SELECT role FROM user_roles WHERE user_id = ? ORDER BY role").get(userId) as
        | { role: UserRole }
        | undefined
    )?.role;

    if (currentRole === nextRole) {
      return Response.json({ ok: true, userId, email: target.email, role: nextRole, changed: false });
    }
    // Demoting the last admin leaves nobody able to promote anyone back.
    if (nextRole !== "admin" && wouldOrphanAdmins(db, userId)) {
      return Response.json(
        { error: "cannot demote the last admin", detail: "promote another admin first" },
        { status: 409 }
      );
    }

    db.transaction(() => {
      db.prepare("DELETE FROM user_roles WHERE user_id = ?").run(userId);
      db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)").run(userId, nextRole);
    })();

    // The role is baked into the access token, so a demotion would otherwise
    // keep its old powers until that token expired. Dropping refresh tokens
    // forces re-authentication at the new level.
    const demoted = ROLE_RANK[nextRole] < ROLE_RANK[(currentRole ?? "reviewer") as UserRole];
    if (demoted) {
      db.prepare("DELETE FROM user_refresh_tokens WHERE user_id = ?").run(userId);
    }

    return Response.json({
      ok: true,
      userId,
      email: target.email,
      role: nextRole,
      previousRole: currentRole ?? null,
      changed: true,
      sessionsRevoked: demoted,
    });
  }

  if (body.disabled) {
    if (wouldOrphanAdmins(db, userId)) {
      return Response.json(
        { error: "cannot disable the last admin", detail: "promote another admin first" },
        { status: 409 }
      );
    }
    db.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").run(nowIso(), userId);
    revokeCredentials(db, userId);
    return Response.json({ ok: true, userId, email: target.email, disabled: true, credentialsRevoked: true });
  }

  db.prepare("UPDATE users SET disabled_at = NULL WHERE id = ?").run(userId);
  return Response.json({ ok: true, userId, email: target.email, disabled: false });
}

/**
 * DELETE — permanent, opt-in via ?hard=true.
 *
 * Without that flag this behaves as disable, so a reflexive DELETE cannot
 * destroy audit history by accident.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const { userId } = await ctx.params;
  const auth = await authorize(req, userId);
  if (auth.error) return auth.error;

  const db = getDb();
  const target = db.prepare("SELECT id, email FROM users WHERE id = ?").get(userId) as
    | { id: string; email: string }
    | undefined;
  if (!target) return Response.json({ error: "user not found" }, { status: 404 });

  if (wouldOrphanAdmins(db, userId)) {
    return Response.json(
      { error: "cannot remove the last admin", detail: "promote another admin first" },
      { status: 409 }
    );
  }

  // Removing a person is the most consequential thing this API does, and it
  // was the one action leaving no trace. Oracle-1 lost two users (4->3 on
  // 2026-08-02, 3->2 on 2026-08-04); the nightly check caught the counts, but
  // 13,776 audit rows contained no user lifecycle event, so *who* removed them
  // and *when* is unanswerable. Record the actor and the subject on both paths
  // — the v8.32 dual-trail shape — before the row is gone.
  const auditRemoval = (mode: "disabled" | "deleted") => {
    writeAuditLogFromEntry(db, {
      actor: auth.session.userId,
      action: mode === "deleted" ? "user.deleted" : "user.disabled",
      target: `user/${userId}`,
      detail: JSON.stringify({
        subjectUserId: userId,
        subjectEmail: target.email,
        actorUserId: auth.session.userId,
        mode,
      }),
      severity: "high",
    });
  };

  const hard = req.nextUrl.searchParams.get("hard") === "true";
  if (!hard) {
    db.prepare("UPDATE users SET disabled_at = ? WHERE id = ?").run(nowIso(), userId);
    revokeCredentials(db, userId);
    auditRemoval("disabled");
    return Response.json({
      ok: true,
      userId,
      email: target.email,
      mode: "disabled",
      detail: "pass ?hard=true to delete permanently, which also removes approval history",
    });
  }

  revokeCredentials(db, userId);
  // Audit before the DELETE: once the row is gone the email is unrecoverable,
  // and an audit trail that cannot name the subject is not a trail.
  auditRemoval("deleted");
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  return Response.json({ ok: true, userId, email: target.email, mode: "deleted" });
}
