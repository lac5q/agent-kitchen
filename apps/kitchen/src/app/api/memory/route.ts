import { parseClaudeMemory } from "@/lib/parsers";
import { MEM0_URL, CLAUDE_MEMORY_PATH } from "@/lib/constants";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source") || "all";
  const query = request.nextUrl.searchParams.get("q") || "";

  const result: Record<string, unknown> = {};

  if (source === "all" || source === "mem0") {
    try {
      const res = await fetch(`${MEM0_URL}/memory/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query || "recent",
          user_id: "luis",
          limit: 50,
        }),
        signal: AbortSignal.timeout(3000),
      });
      result.mem0 = await res.json();
    } catch {
      result.mem0 = { error: "mem0 unavailable" };
    }
  }

  if (source === "all" || source === "claude") {
    result.claude = await parseClaudeMemory(CLAUDE_MEMORY_PATH);
  }

  return Response.json({ ...result, timestamp: new Date().toISOString() });
}
