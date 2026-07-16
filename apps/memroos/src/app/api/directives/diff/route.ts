/**
 * Phase 126 / ENTOPS-06: Warn-only directive diff against canonical.
 *
 * GET /api/directives/diff?tenant=
 *   Body (JSON): { local: string, canonical: string }
 *
 * Returns added/removed/changed lines. NEVER mutates or trims content.
 */

import { NextRequest } from "next/server";
import { z } from "zod";

import { authenticateUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/middleware-roles";
import {
  directiveDiff,
  getTenantDirectiveBudget,
  loadDirectiveBudgetConfig,
} from "@/lib/directive-budget";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  local: z.string().max(2_000_000),
  canonical: z.string().max(2_000_000),
});

function extractBearer(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authorizeAdminOrApiKey(
  req: NextRequest
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const session = await authenticateUser(req);
  if (session) {
    const roleError = requireRole(session.role, "admin");
    if (!roleError) return { ok: true };
  }

  const presented = extractBearer(req);
  if (!presented) {
    return { ok: false, status: 401, error: "authentication required" };
  }

  const operatorKey = process.env.MEMROOS_OPERATOR_API_KEY?.trim() ?? "";
  const agentKey = process.env.MEMROOS_AGENT_API_KEY?.trim() ?? "";
  if (operatorKey && safeEqual(presented, operatorKey)) return { ok: true };
  if (agentKey && safeEqual(presented, agentKey)) return { ok: true };

  return { ok: false, status: 403, error: "admin or api key required" };
}

export async function GET(req: NextRequest) {
  const auth = await authorizeAdminOrApiKey(req);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = req.nextUrl.searchParams.get("tenant") ?? undefined;
  const config = tenantId
    ? getTenantDirectiveBudget(tenantId)
    : loadDirectiveBudgetConfig();

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }

  if (!raw || typeof raw !== "object") {
    return Response.json(
      {
        error: "JSON body required with local and canonical directive texts",
        hint: "GET /api/directives/diff?tenant=<id> with body { local, canonical }",
        enforcement: "warn_only",
        config,
      },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "validation failed", details: parsed.error.flatten(), config },
      { status: 400 }
    );
  }

  const diff = directiveDiff(parsed.data.local, parsed.data.canonical);

  return Response.json({
    ok: true,
    tenant: tenantId ?? null,
    enforcement: "warn_only",
    config,
    diff,
    message: diff.identical
      ? "Local matches canonical"
      : "Warn-only drift detected — content was not trimmed or rewritten",
  });
}
