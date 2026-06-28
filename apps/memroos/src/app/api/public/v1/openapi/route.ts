import { buildPublicEvalOpenApiDocument } from "@/lib/public-api/eval-contract";

export const dynamic = "force-dynamic";

function publicBaseUrl(request: Request): string {
  const configured = process.env.MEMROOS_PUBLIC_EVAL_OPENAPI_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  return Response.json(buildPublicEvalOpenApiDocument(publicBaseUrl(request)));
}
