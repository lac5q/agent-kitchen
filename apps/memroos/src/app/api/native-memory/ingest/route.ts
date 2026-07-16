/**
 * Phase 127 / ENTOPS-07: POST /api/native-memory/ingest
 *
 * Operator + API-key authenticated sink for harness auto-memory writes.
 * Returns sanitized replay payload. Does not write harness files.
 */

import { NextRequest } from "next/server";
import { z } from "zod";

import { authenticateUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/middleware-roles";
import {
  processNativeMemoryIngest,
  NATIVE_MEMORY_SINK_POLICY,
} from "@/lib/native-memory/sink";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  source: z.enum(["claude", "hermes", "codex"]),
  agentId: z.string().min(1).max(128),
  userId: z.string().min(1).max(128),
  content: z.string().max(2_000_000),
  memoryPath: z.string().min(1).max(2048),
  tenantId: z.string().min(1).max(128).optional(),
  canonicalContent: z.string().max(2_000_000).optional(),
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

async function authorizeOperatorOrApiKey(
  req: NextRequest
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const session = await authenticateUser(req);
  if (session) {
    const roleError = requireRole(session.role, "operator");
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

  return { ok: false, status: 403, error: "operator or api key required" };
}

export async function POST(req: NextRequest) {
  const auth = await authorizeOperatorOrApiKey(req);
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
  const result = processNativeMemoryIngest({
    source: body.source,
    agentId: body.agentId,
    userId: body.userId,
    content: body.content,
    memoryPath: body.memoryPath,
    tenantId: body.tenantId,
    canonicalContent: body.canonicalContent,
  });

  return Response.json({
    ok: true,
    policy: NATIVE_MEMORY_SINK_POLICY,
    ...result,
  });
}
