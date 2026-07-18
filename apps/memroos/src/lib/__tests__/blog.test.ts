import fs from "fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAllPosts, getAllPostSlugs, getPostBySlug } from "../blog";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("blog content loader", () => {
  it("loads packaged blog markdown from the app root", () => {
    const slugs = getAllPostSlugs();

    expect(slugs).toContain("agentic-memory-benchmark");

    const post = getPostBySlug("agentic-memory-benchmark");

    expect(post?.frontmatter.title).toContain("Agentic Memory Benchmark");
    expect(post?.content).toContain("Mem0 scored 70.44/100");
    expect(post?.content).toContain("Zep scored 68.64/100");
  });

  it("returns empty results when no blog content directory exists", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    expect(getAllPostSlugs()).toEqual([]);
    expect(getPostBySlug("missing")).toBeNull();
    expect(getAllPosts()).toEqual([]);
  });

  it("filters markdown files and sorts loaded posts by publish date", () => {
    vi.spyOn(fs, "existsSync").mockImplementation((target) => {
      const value = String(target);
      return value.endsWith("content/blog") || value.endsWith("old.md") || value.endsWith("new.md");
    });
    vi.spyOn(fs, "readdirSync").mockReturnValue(["old.md", "notes.txt", "new.md"] as never);
    vi.spyOn(fs, "readFileSync").mockImplementation((target) => {
      const slug = String(target).includes("new.md") ? "new" : "old";
      const date = slug === "new" ? "2026-07-02" : "2026-07-01";
      return `---\ntitle: ${slug}\ndescription: ${slug}\npublishedAt: ${date}\ntags: []\nkeywords: []\n---\n# ${slug}\n`;
    });

    expect(getAllPostSlugs()).toEqual(["old", "new"]);
    expect(getPostBySlug("absent")).toBeNull();
    expect(getAllPosts().map((post) => post.slug)).toEqual(["new", "old"]);
  });

  it("parses optional metadata fields without dropping markdown content", () => {
    vi.spyOn(fs, "existsSync").mockImplementation((target) => String(target).endsWith("content/blog") || String(target).endsWith("deep-dive.md"));
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      [
        "---",
        "title: Deep Dive",
        "description: Details",
        "publishedAt: 2026-07-01",
        "updatedAt: 2026-07-02",
        "author: MemRoOS",
        "tags: [memory]",
        "keywords: [agents]",
        "---",
        "Body content",
      ].join("\n")
    );

    const post = getPostBySlug("deep-dive");

    expect(post).toMatchObject({
      slug: "deep-dive",
      frontmatter: {
        title: "Deep Dive",
        author: "MemRoOS",
      },
      content: "Body content",
    });
    expect(post?.frontmatter.updatedAt).toEqual(new Date("2026-07-02T00:00:00.000Z"));
  });
});
