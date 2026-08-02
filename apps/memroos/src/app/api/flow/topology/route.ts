/**
 * Live workflow-map topology.
 *
 * Assembled server-side because the server already has DB access and the
 * session cookie already authenticates it — a client stitching /api/agents,
 * store counts, and Nango connections together would need three round trips
 * and could not read the tables directly.
 */

import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { listAgentsVisibleTo, listAllAgentsUnscoped } from "@/lib/agent-registry";
import { authenticateUser } from "@/lib/auth/session";
import { authorizeRegistryWrite } from "@/lib/operator-auth";
import { listNangoConnections } from "@/lib/tool-auth/nango-client";
import { getProvider } from "@/lib/tool-auth/providers";
import { buildTopology } from "@/lib/workflow/topology";

/**
 * Which agents this caller may be told about.
 *
 * Signed-in humans see only their own and shared agents; a system caller
 * holding the operator key (or on loopback) still sees everything, because the
 * MCP server and local runtime depend on the full picture. An anonymous caller
 * sees nothing rather than the whole registry.
 */
async function agentsForCaller(request: Request) {
  const session = await authenticateUser(request);
  if (session) {
    return listAgentsVisibleTo({ userId: session.userId, role: session.role });
  }
  return authorizeRegistryWrite(request) ? listAllAgentsUnscoped() : [];
}

export async function GET(request: Request) {
  const db = getDb();

  const agents = (await agentsForCaller(request)).map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    status: a.status,
  }));

  // Connected providers are the real inbound sources. Nango being unreachable
  // must not blank the whole map — the agent and store columns are still true.
  let sources: Array<{ id: string; label: string; sub: string }> = [];
  try {
    const connections = await listNangoConnections();
    const seen = new Set<string>();
    for (const c of connections) {
      if (seen.has(c.providerKey)) continue;
      seen.add(c.providerKey);
      sources.push({
        id: c.providerKey,
        label: getProvider(c.providerKey)?.label ?? c.providerKey,
        sub: "connected",
      });
    }
  } catch {
    sources = [];
  }

  const topology = buildTopology(db, { agents, sources });
  return NextResponse.json(topology, {
    headers: { "Cache-Control": "no-store" },
  });
}
