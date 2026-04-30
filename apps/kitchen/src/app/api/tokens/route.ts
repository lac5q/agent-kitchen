import { parseTokenStats } from "@/lib/parsers";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = parseTokenStats();
  if (!stats) {
    return Response.json(
      { error: "RTK not available", stats: null },
      { status: 503 }
    );
  }
  return Response.json({ stats, timestamp: new Date().toISOString() });
}
