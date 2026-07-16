/**
 * Phase 127 / ENTOPS-08: POST /api/dsar/delete
 *
 * Admin endpoint: insert erasure_tombstones for a user. NEVER deletes audit rows.
 */

import { NextRequest } from "next/server";
import { z } from "zod";

import { authenticateUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/middleware-roles";
import { getDb } from "@/lib/db";
import { deleteDsarUser } from "@/lib/export/dsar-export";
import { ERASURE_TOMBSTONE_AUDIT_POLICY } from "@/lib/erasure-tombstone";
import { verifyKnowledgeAuditChain } from "@/lib/audit/knowledge-chain";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  userId: z.string().min(1).max(128),
  tenantId: z.string().min(1).max(128).optional(),
});

export async function POST(req: NextRequest) {
  const session = await authenticateUser(req);
  const roleError = requireRole(session?.role, "admin");
  if (roleError) return roleError;
  if (!session) {
    return Response.json({ error: "authentication required" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid json body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const tenantId = parsed.data.tenantId ?? session.tenantId ?? "default-tenant";
  const db = getDb();

  const result = deleteDsarUser({
    tenantId,
    userId: parsed.data.userId,
    tombstonedBy: session.userId ?? session.email ?? "admin",
    db,
  });

  // Prove the knowledge audit chain still verifies after tombstoning.
  const chain = verifyKnowledgeAuditChain(db, tenantId);

  return Response.json({
    ok: true,
    auditPolicy: ERASURE_TOMBSTONE_AUDIT_POLICY,
    auditRowsPreserved: result.auditRowsPreserved,
    tombstones: result.tombstones,
    knowledgeChainValid: chain.valid,
    knowledgeChainChecked: chain.checked,
  });
}
