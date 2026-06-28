import { a2aContractHeaders, buildA2aOpenApiDocument } from "@/lib/a2a/contract";

export const dynamic = "force-dynamic";

function publicBaseUrl(request: Request): string {
  const configured = process.env.MEMROOS_A2A_OPENAPI_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  return Response.json(buildA2aOpenApiDocument(publicBaseUrl(request)), {
    headers: a2aContractHeaders(),
  });
}
