/**
 * Phase 126 / ENTOPS-06: Admin endpoint for per-tenant directive budgets.
 *
 * POST /api/directives/budget
 *   - Set override: { tenant_id, budget_lines }
 *   - Or evaluate:  { tenant_id?, directive_text, canonical_text? }
 *
 * Auth: admin session (JWT/API key) OR MEMROOS_OPERATOR_API_KEY /
 * MEMROOS_AGENT_API_KEY bearer (same pattern as audit/knowledge).
 *
 * NEVER auto-trims directive content.
 */

import { NextRequest } from "next/server";
import { z } from "zod";

import { authenticateUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/middleware-roles";
import {
  computeDirectiveBudget,
  getTenantDirectiveBudget,
  loadDirectiveBudgetConfig,
  setTenantDirectiveBudget,
} from "@/lib/directive-budget";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    tenant_id: z.string().min(1).max(128).optional(),
    budget_lines: z.number().int().positive().max(100_000).optional(),
    directive_text: z.string().max(2_000_000).optional(),
    canonical_text: z.string().max(2_000_000).optional(),
  })
  .refine(
    (body) =>
      typeof body.budget_lines === "number" ||
      typeof body.directive_text === "string",
    { message: "provide budget_lines and/or directive_text" }
  );

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

  return Response.json({
    ok: true,
    enforcement: "warn_only",
    config,
  });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeAdminOrApiKey(req);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
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

  const body = parsed.data;
  let config =
    body.tenant_id !== undefined
      ? getTenantDirectiveBudget(body.tenant_id)
      : loadDirectiveBudgetConfig();

  if (typeof body.budget_lines === "number") {
    if (!body.tenant_id) {
      return Response.json(
        { error: "tenant_id required when setting budget_lines" },
        { status: 400 }
      );
    }
    config = setTenantDirectiveBudget(body.tenant_id, body.budget_lines);
  }

  if (typeof body.directive_text === "string") {
    const report = computeDirectiveBudget(
      body.directive_text,
      config,
      body.canonical_text
    );
    return Response.json({
      ok: true,
      enforcement: "warn_only",
      config,
      report,
    });
  }

  return Response.json({
    ok: true,
    enforcement: "warn_only",
    config,
  });
}
