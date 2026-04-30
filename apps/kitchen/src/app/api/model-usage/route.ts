import { parseModelUsage } from "@/lib/parsers";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sinceParam = req.nextUrl.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  const usage = await parseModelUsage(since);
  return Response.json({ usage, timestamp: new Date().toISOString() });
}
