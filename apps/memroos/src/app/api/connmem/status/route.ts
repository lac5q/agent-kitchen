// Kernel seam for Phase 185 / v8.27 — CONNMEM Runtime Integration.
//
// Proxies GET /api/connmem/status to the connmem FastAPI service's
// /v1/status endpoint. Uses authenticateAgentHeaders so an agent
// (or operator, via the registry auth path) can read CONNMEM state
// from the kernel route. The route is also enumerated by the
// check:route-auth-boundary gate (pattern /api/connmem/...).
//
// CONNMEM-RT-04: kernel seam for CONNMEM. Auth marker is
// `authenticateAgentHeaders` so the gate accepts this file.

import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent/registry";

export const dynamic = "force-dynamic";

const CONNMEM_DEFAULT_PORT = 3290;

function connmemBaseUrl(): string {
  // CONNMEM_URL lets tests / non-default deployments point the kernel
  // at a different upstream. The default is the in-cluster service
  // name; locally it falls back to 127.0.0.1:3290 (matches the
  // runtime-topology port).
  return (
    process.env.CONNMEM_URL ??
    process.env.MEMROOS_DOCKER_CONNMEM_URL ??
    `http://127.0.0.1:${CONNMEM_DEFAULT_PORT}`
  );
}

export async function GET(req: NextRequest) {
  const agent = authenticateAgentHeaders(req.headers);
  if (!agent) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = `${connmemBaseUrl()}/v1/status`;
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!upstream.ok) {
      return Response.json(
        { ok: false, error: `connmem upstream ${upstream.status}` },
        { status: 502 },
      );
    }
    const body = await upstream.json();
    return Response.json({ ok: true, ...body });
  } catch (err) {
    return Response.json(
      { ok: false, error: `connmem upstream unreachable: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
