import { NextResponse } from "next/server";

import { searchMeetingCollections, type SearchMeetingCollectionsResult } from "@/lib/memory/meeting-qmd-recall";
import {
  SOURCE_STATUS,
  isTerminalSourceStatus,
  type MeetingSourceStatus,
} from "@/lib/meeting-source-status";

export const dynamic = "force-dynamic";

/**
 * GET /api/meetings/health?q=<query>
 *
 * Phase 172 (MEETREL-FOLLOWUP-05) operator endpoint. Federates the unified
 * meeting recall over all enabled collections, but ONLY returns the per-
 * collection status block + aggregate status — never the recall content
 * (operators should not get transcript bodies back through this endpoint;
 * transcript bodies go through `memory_recall`).
 *
 * Response shape:
 *   {
 *     query: string,
 *     collections: { [name]: { status, count, lastIndexAt, reason? } },
 *     aggregateStatus: SourceStatus,
 *     healthy: boolean,    // aggregate === recalled
 *     timestamp: string,
 *     note: string,
 *   }
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();

  // An empty query still returns a status snapshot so the health endpoint can
  // be polled cheaply. We use the union of all enabled collections but with
  // an empty per-collection probe — every collection will surface as
  // `indexed_unrecalled` (qmd rejects empty queries as `query is required`).
  const probeQuery = query || "__memroos-meetings-health__";

  let result: SearchMeetingCollectionsResult;
  try {
    result = await searchMeetingCollections(probeQuery, 1);
  } catch (error) {
    return NextResponse.json(
      {
        error: "meetings/health probe failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }

  const collectionBlock: Record<string, MeetingSourceStatus> = {};
  for (const [name, status] of Object.entries(result.collectionStatus)) {
    collectionBlock[name] = status;
  }

  const healthy = isTerminalSourceStatus(result.aggregateStatus);

  return NextResponse.json(
    {
      query,
      collections: collectionBlock,
      aggregateStatus: result.aggregateStatus,
      healthy,
      healthyLiteralExpected: SOURCE_STATUS.recalled,
      timestamp: new Date().toISOString(),
      note:
        "Per-collection status only. Transcript bodies remain on the memory_recall lane.",
    },
    { status: 200 }
  );
}
