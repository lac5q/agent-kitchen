// Notion page-content extraction.
//
// The defect these cover: /v1/search returns properties + url but no body, so
// the connector indexed 14 URL-only records — present in messages_fts,
// useless for semantic recall. Shapes here mirror the live API responses.

import { describe, expect, it } from "vitest";

import {
  buildNotionContent,
  extractNotionTitle,
  notionBlocksToText,
  richTextToPlain,
} from "../notion-content";

describe("richTextToPlain", () => {
  it("joins the spans Notion splits a styled sentence across", () => {
    // Notion emits one span per style run; reading only the first truncates.
    const rich = [
      { plain_text: "Ship the " },
      { plain_text: "connector", annotations: { bold: true } },
      { plain_text: " lane" },
    ];
    expect(richTextToPlain(rich)).toBe("Ship the connector lane");
  });

  it("falls back to the nested text.content shape", () => {
    expect(richTextToPlain([{ text: { content: "fallback" } }])).toBe("fallback");
  });

  it("returns empty for non-array input", () => {
    expect(richTextToPlain(undefined)).toBe("");
    expect(richTextToPlain(null)).toBe("");
    expect(richTextToPlain("nope")).toBe("");
  });
});

describe("extractNotionTitle", () => {
  it("finds the title property by type, not by key name", () => {
    // In a database the title column is named by the user — "Task" here. Key
    // matching on "title" would miss it entirely.
    const record = {
      properties: {
        Task: { type: "title", title: [{ plain_text: "Draft Alacriti brief" }] },
        Status: { type: "select", select: { name: "In Progress" } },
      },
    };
    expect(extractNotionTitle(record)).toBe("Draft Alacriti brief");
  });

  it("handles the workspace-page shape where title is top level", () => {
    expect(extractNotionTitle({ title: [{ plain_text: "Getting Started" }] })).toBe(
      "Getting Started"
    );
  });

  it("returns empty when there is no title property", () => {
    expect(extractNotionTitle({ properties: { Status: { type: "select" } } })).toBe("");
    expect(extractNotionTitle({})).toBe("");
  });
});

describe("notionBlocksToText", () => {
  it("flattens the common text block types with markdown-ish prefixes", () => {
    const blocks = [
      { type: "heading_1", heading_1: { rich_text: [{ plain_text: "Roadmap" }] } },
      { type: "paragraph", paragraph: { rich_text: [{ plain_text: "Q3 plan." }] } },
      {
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ plain_text: "Ship recall" }] },
      },
    ];
    expect(notionBlocksToText(blocks)).toBe("# Roadmap\nQ3 plan.\n- Ship recall");
  });

  it("skips unsupported block types instead of emitting placeholders", () => {
    // A body full of "[image]" lines would pollute both FTS and the embedding.
    const blocks = [
      { type: "image", image: { file: { url: "https://x/y.png" } } },
      { type: "divider", divider: {} },
      { type: "paragraph", paragraph: { rich_text: [{ plain_text: "real text" }] } },
    ];
    expect(notionBlocksToText(blocks)).toBe("real text");
  });

  it("skips text blocks whose rich_text is empty", () => {
    const blocks = [
      { type: "paragraph", paragraph: { rich_text: [] } },
      { type: "paragraph", paragraph: { rich_text: [{ plain_text: "kept" }] } },
    ];
    expect(notionBlocksToText(blocks)).toBe("kept");
  });

  it("stops at the char cap without splitting a line mid-word", () => {
    const blocks = [
      { type: "paragraph", paragraph: { rich_text: [{ plain_text: "aaaa" }] } },
      { type: "paragraph", paragraph: { rich_text: [{ plain_text: "bbbb" }] } },
      { type: "paragraph", paragraph: { rich_text: [{ plain_text: "cccc" }] } },
    ];
    const out = notionBlocksToText(blocks, 9);
    expect(out).toBe("aaaa\nbbbb");
    expect(out.endsWith("bbbb")).toBe(true);
  });

  it("returns empty for non-array input", () => {
    expect(notionBlocksToText(undefined)).toBe("");
    expect(notionBlocksToText({})).toBe("");
  });
});

describe("buildNotionContent", () => {
  it("leads with the title so it drives the FTS snippet and embedding", () => {
    expect(buildNotionContent({ title: "Roadmap", bodyText: "Q3 plan." })).toBe(
      "Roadmap\n\nQ3 plan."
    );
  });

  it("omits the URL — the manifest appends it as a separate content field", () => {
    // Including it here too would print the URL twice in every record.
    const out = buildNotionContent({ title: "Roadmap", bodyText: "Q3 plan." });
    expect(out).not.toContain("http");
  });

  it("returns empty when there is neither title nor body", () => {
    // Lets the record fall back to the URL-only form rather than a blank line.
    expect(buildNotionContent({ title: "", bodyText: "" })).toBe("");
  });

  it("survives a title with no body and a body with no title", () => {
    expect(buildNotionContent({ title: "Only title", bodyText: "" })).toBe("Only title");
    expect(buildNotionContent({ title: "", bodyText: "Only body" })).toBe("Only body");
  });
});
