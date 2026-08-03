import type { NextRequest } from "next/server";

import { authenticateUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/middleware-roles";
import { buildMemoryInventory } from "@/lib/memory-inventory";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) {
    return Response.json({ error: "authentication required" }, { status: 401 });
  }
  const roleError = // Reading memory is what a reviewer is for: gating this at operator made
  // the console render permission refusals as failures — a wall of ERROR
  // badges on a system that was working correctly. Mutation and bulk
  // export stay above reviewer.
  requireRole(session.role, "reviewer");
  if (roleError) return roleError;

  const url = req.nextUrl ?? new URL(req.url);
  return Response.json(await buildMemoryInventory(url));
}
