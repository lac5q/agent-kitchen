import { parseModelUsage } from "@/lib/parsers";

export const dynamic = "force-dynamic";

export async function GET() {
  const usage = await parseModelUsage();
  return Response.json({ usage, timestamp: new Date().toISOString() });
}
