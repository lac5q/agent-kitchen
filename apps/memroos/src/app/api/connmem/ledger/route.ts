// Kernel seam for Phase 185 / v8.27 — CONNMEM Runtime Integration.
//
// Proxies GET /api/connmem/ledger to the connmem FastAPI service's
// /v1/ledger endpoint. Auth marker is `authenticateAgentHeaders`.

import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent/registry";

export const dynamic = "force-dynamic";

const CONNMEM_DEFAULT_PORT = 3290;

function connmemBaseUrl(): string {
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

  const url = `${connmemBaseUrl()}/v1/ledger`;
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
