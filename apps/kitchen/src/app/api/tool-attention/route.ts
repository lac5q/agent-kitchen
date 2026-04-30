import type { NextRequest } from "next/server";
import { getToolAttention } from "@/lib/tool-attention";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "25");
  return Response.json(getToolAttention(query, Number.isFinite(limit) ? limit : 25));
}
