import { describe, expect, it } from "vitest";
import { getAllPostSlugs, getPostBySlug } from "../blog";

describe("blog content loader", () => {
  it("loads packaged blog markdown from the app root", () => {
    const slugs = getAllPostSlugs();

    expect(slugs).toContain("agentic-memory-benchmark");

    const post = getPostBySlug("agentic-memory-benchmark");

    expect(post?.frontmatter.title).toContain("Agentic Memory Benchmark");
    expect(post?.content).toContain("Mem0 scored 70.44/100");
    expect(post?.content).toContain("Zep scored 68.64/100");
  });
});
