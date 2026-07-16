/**
 * Phase 127 / ENTOPS-08: POST /api/dsar/export
 *
 * Admin endpoint wrapping exportDsarPackage (vault + audit for one user).
 */

import { NextRequest } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { z } from "zod";

import { authenticateUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/middleware-roles";
import { getDb } from "@/lib/db";
import { exportDsarPackage } from "@/lib/export/dsar-export";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  userId: z.string().min(1).max(128),
  tenantId: z.string().min(1).max(128).optional(),
  vaultRoot: z.string().max(2048).optional(),
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
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-dsar-api-"));
  try {
    const result = exportDsarPackage({
      tenantId,
      userId: parsed.data.userId,
      outDir,
      vaultRoot: parsed.data.vaultRoot,
      db: getDb(),
    });

    const bytes = fs.readFileSync(result.archivePath);
    const filename = path.basename(result.archivePath);
    const contentType = filename.endsWith(".zip")
      ? "application/zip"
      : "application/gzip";

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Memroos-Dsar-Manifest": Buffer.from(
          fs.readFileSync(result.manifestPath, "utf8")
        ).toString("base64"),
        "X-Memroos-Dsar-File-Count": String(result.fileCount),
        "X-Memroos-Dsar-Audit-Count": String(result.auditEntryCount),
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}
