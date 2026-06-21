import type { NextRequest } from "next/server";
import path from "path";
import { renderObservabilityHtml } from "@/lib/agent-runtime/observability";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

function defaultHermesRoot(): string {
  return path.join(process.env.HOME ?? process.cwd(), ".hermes");
}

export function GET(req: NextRequest) {
  if (!authorizeRegistryWrite(req)) return registryWriteUnauthorizedResponse();

  const url = req.nextUrl ?? new URL(req.url);
  const root = url.searchParams.get("root") || defaultHermesRoot();
  return new Response(renderObservabilityHtml(root), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
