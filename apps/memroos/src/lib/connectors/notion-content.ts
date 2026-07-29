/**
 * Notion page-content extraction.
 *
 * `/v1/search` returns a page's `properties` and `url` but never its body, so
 * the connector indexed URL-only records: technically present in
 * `messages_fts`, useless for semantic recall because there was no prose to
 * match. Turning those into real records needs two things the search response
 * cannot give us — the title (buried in a property whose *name* varies per
 * database) and the body (a separate `/v1/blocks/{id}/children` call).
 *
 * These functions are pure so the shape-handling below can be tested without
 * a live Notion workspace; the fetching lives in `notion-fetch.ts`.
 */

/** Block types whose rich_text is worth indexing, mapped to a text prefix. */
const TEXT_BLOCK_PREFIXES: Record<string, string> = {
  paragraph: "",
  heading_1: "# ",
  heading_2: "## ",
  heading_3: "### ",
  bulleted_list_item: "- ",
  numbered_list_item: "- ",
  to_do: "- ",
  toggle: "",
  quote: "> ",
  callout: "",
  code: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Concatenate a Notion `rich_text` array into plain text.
 *
 * Notion splits a styled sentence into several rich_text spans, so reading
 * only the first would truncate mid-sentence — join them all.
 */
export function richTextToPlain(richText: unknown): string {
  if (!Array.isArray(richText)) return "";
  return richText
    .map((span) => {
      if (!isRecord(span)) return "";
      if (typeof span.plain_text === "string") return span.plain_text;
      // Fall back to the nested text.content shape.
      const text = isRecord(span.text) ? span.text : undefined;
      return typeof text?.content === "string" ? text.content : "";
    })
    .join("")
    .trim();
}

/**
 * Pull the page title out of `properties`.
 *
 * The title property is NOT reliably called "title": in a database it takes
 * the name of that database's title column (e.g. "Name", "Task"). The stable
 * marker is `type === "title"`, so match on that and fall back to a literal
 * `title` key for the workspace-page shape.
 */
export function extractNotionTitle(record: Record<string, unknown>): string {
  const properties = isRecord(record.properties) ? record.properties : undefined;
  if (properties) {
    for (const value of Object.values(properties)) {
      if (!isRecord(value)) continue;
      if (value.type === "title") {
        const text = richTextToPlain(value.title);
        if (text) return text;
      }
    }
  }
  // Workspace pages and some API shapes expose `title` directly.
  if (Array.isArray(record.title)) {
    const text = richTextToPlain(record.title);
    if (text) return text;
  }
  return "";
}

/**
 * Flatten Notion blocks into indexable plain text.
 *
 * Unsupported block types (images, dividers, embeds) contribute nothing
 * rather than a placeholder — a body of "[unsupported]" lines would pollute
 * both full-text matches and the embedding.
 */
export function notionBlocksToText(blocks: unknown, maxChars = 12_000): string {
  if (!Array.isArray(blocks)) return "";
  const lines: string[] = [];
  let total = 0;

  for (const block of blocks) {
    if (!isRecord(block)) continue;
    const type = typeof block.type === "string" ? block.type : "";
    if (!(type in TEXT_BLOCK_PREFIXES)) continue;
    const body = isRecord(block[type]) ? (block[type] as Record<string, unknown>) : undefined;
    if (!body) continue;

    const text = richTextToPlain(body.rich_text);
    if (!text) continue;

    const line = `${TEXT_BLOCK_PREFIXES[type]}${text}`;
    // Stop at the cap rather than truncating mid-line, so the stored body
    // never ends inside a word.
    if (total + line.length > maxChars) break;
    lines.push(line);
    total += line.length + 1;
  }

  return lines.join("\n").trim();
}

/**
 * Assemble the indexed body for a Notion record.
 *
 * Title first so it leads the FTS snippet and the embedding, then the page
 * text. The URL is deliberately NOT included: the manifest lists it as a
 * separate `contentFields` entry, and `writeConnectorRecord` joins those
 * fields — putting it here too would print it twice in every record.
 *
 * Returns "" when there is neither title nor body, which lets the record fall
 * back to the URL-only form rather than writing a blank line.
 */
export function buildNotionContent(input: { title: string; bodyText: string }): string {
  return [input.title, input.bodyText]
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0)
    .join("\n\n");
}
