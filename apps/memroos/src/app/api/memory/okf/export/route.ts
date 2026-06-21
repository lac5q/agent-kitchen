import type { NextRequest } from "next/server";

import { authenticateUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/middleware-roles";
import { CLAUDE_MEMORY_PATH } from "@/lib/constants";
import {
  buildOkfBundle,
  buildOkfConceptFromMemory,
  validateOkfBundle,
} from "@/lib/okf";
import { parseClaudeMemory } from "@/lib/parsers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });
  const roleError = requireRole(session.role, "operator");
  if (roleError) return roleError;

  const url = req.nextUrl ?? new URL(req.url);
  const source = url.searchParams.get("source") ?? "claude";
  if (source !== "claude") {
    return Response.json(
      {
        ok: false,
        error: "unsupported_source",
        message: "OKF export currently supports source=claude only.",
      },
      { status: 400 }
    );
  }

  const timestamp = new Date().toISOString();
  const memories = await parseClaudeMemory(CLAUDE_MEMORY_PATH);
  const concepts = memories.map((memory) =>
    buildOkfConceptFromMemory(memory, {
      securityLabel: "local",
      authorizationPolicy: "operator_export",
    })
  );
  const bundle = buildOkfBundle({
    name: "MemRoOS memory export",
    concepts,
    timestamp,
  });
  const validation = validateOkfBundle(bundle);

  return Response.json({
    ok: true,
    source,
    okfVersion: "0.1",
    conceptCount: concepts.length,
    bundle,
    validation,
    timestamp,
  });
}
