import { parseTokenStats } from "@/lib/parsers";

export const dynamic = "force-dynamic";

/**
 * GET /api/tokens
 *
 * RTK CLI savings/proxy stats when available. Never hard-fail the Ledger UI:
 * return 200 with available=false so callers can fall back to /api/model-usage
 * for multi-model token totals.
 */
export async function GET() {
  const stats = parseTokenStats();
  if (!stats) {
    return Response.json({
      available: false,
      stats: null,
      error: "RTK not available",
      timestamp: new Date().toISOString(),
    });
  }
  return Response.json({
    available: true,
    stats,
    timestamp: new Date().toISOString(),
  });
}
