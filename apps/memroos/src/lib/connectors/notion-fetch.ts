/**
 * Fetch Notion page bodies for the connector sync.
 *
 * Separated from `notion-content.ts` so the shape-handling there stays pure
 * and unit-testable; this module owns only the I/O and its bounds.
 *
 * Bounds exist because this is the one place the connector makes an N+1 call:
 * one `/v1/blocks/{id}/children` request per changed page, on top of the
 * single `/v1/search`. Notion rate-limits at roughly 3 requests/second, so an
 * unbounded recursive walk of a large workspace would both stall the sync
 * cycle and get throttled.
 */

import { callRest } from "./mcp-client";
import { notionBlocksToText } from "./notion-content";

export const NOTION_VERSION = "2022-06-28";

/** Nested blocks (toggles, columns) are followed to this depth and no further. */
export const MAX_BLOCK_DEPTH = 2;
/** Hard ceiling on block-children requests per page, across all depths. */
export const MAX_BLOCK_REQUESTS_PER_PAGE = 6;
/**
 * Ceiling on stored body text per page, applied across ALL requests for that
 * page rather than per request. Per-request would let a paginated or deeply
 * nested page reach MAX_BLOCK_REQUESTS_PER_PAGE times this budget.
 */
export const MAX_PAGE_TEXT_CHARS = 12_000;

interface BlockChildrenPayload {
  results?: unknown[];
  has_more?: boolean;
  next_cursor?: string | null;
}

/**
 * Fetch a page's blocks and flatten them to plain text.
 *
 * Returns "" rather than throwing when the page cannot be read: a single
 * unreadable page (deleted between search and fetch, or shared with the
 * integration at a narrower scope) must not fail the whole sync cycle. The
 * record still gets written with its title and URL, which is what it had
 * before this enrichment existed.
 */
export async function fetchNotionPageText(input: {
  endpoint: string;
  accessToken: string;
  pageId: string;
  signal?: AbortSignal;
}): Promise<string> {
  let requests = 0;
  let charsUsed = 0;

  async function walk(blockId: string, depth: number): Promise<string[]> {
    if (depth > MAX_BLOCK_DEPTH) return [];
    const chunks: string[] = [];
    let cursor: string | null = null;

    do {
      if (requests >= MAX_BLOCK_REQUESTS_PER_PAGE) break;
      if (charsUsed >= MAX_PAGE_TEXT_CHARS) break;
      requests += 1;

      const body: Record<string, unknown> = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;

      const { payload } = await callRest(
        input.endpoint,
        input.accessToken,
        {
          method: "GET",
          path: `/v1/blocks/${encodeURIComponent(blockId)}/children`,
          headers: { "Notion-Version": NOTION_VERSION },
          body,
        },
        input.signal,
      );

      const page = (payload ?? {}) as BlockChildrenPayload;
      const results = Array.isArray(page.results) ? page.results : [];
      // Spend from the page-wide budget, not a fresh one per request.
      const text = notionBlocksToText(results, MAX_PAGE_TEXT_CHARS - charsUsed);
      if (text) {
        chunks.push(text);
        charsUsed += text.length;
      }

      // Recurse into blocks that declare children (toggles, callouts,
      // columns). Depth is capped above; without the cap a deeply nested
      // page could issue an unbounded number of requests.
      if (depth < MAX_BLOCK_DEPTH) {
        for (const block of results) {
          if (requests >= MAX_BLOCK_REQUESTS_PER_PAGE) break;
          if (
            block !== null &&
            typeof block === "object" &&
            (block as Record<string, unknown>).has_children === true
          ) {
            const childId = (block as Record<string, unknown>).id;
            if (typeof childId === "string" && childId) {
              chunks.push(...(await walk(childId, depth + 1)));
            }
          }
        }
      }

      cursor = typeof page.next_cursor === "string" && page.has_more === true
        ? page.next_cursor
        : null;
    } while (cursor);

    return chunks;
  }

  try {
    const chunks = await walk(input.pageId, 0);
    return chunks.filter(Boolean).join("\n").trim();
  } catch (err) {
    console.warn(`[connectors] notion: could not read blocks for ${input.pageId}:`, err);
    return "";
  }
}
