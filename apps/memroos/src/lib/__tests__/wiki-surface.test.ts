/**
 * Wiki vault + digest unit coverage (v8.14 WIKISURF).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  clusterKeyForMemory,
  readWikiDigestWatermark,
  runWikiDigest,
  shouldSkipMemory,
  WIKI_DIGEST_CRON_ID,
} from "@/lib/wiki-digest";
import {
  extractWikilinks,
  getWikiRoot,
  listWikiTree,
  readWikiPage,
  resolveWikilink,
  resolveWikiPath,
  searchWikiPages,
} from "@/lib/wiki-vault";
import { loadWikiGraph } from "@/lib/wiki-graph";
import { listCronHealthJobs } from "@/lib/cron-health";
import { initSchema } from "@/lib/db-schema";
import Database from "better-sqlite3";

const tempDirs: string[] = [];

function makeVault(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-wiki-"));
  tempDirs.push(root);
  const wiki = path.join(root, "llm-wiki", "wiki");
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(wiki, "index.md"), "# Wiki Index\n\nSee [[memroos-digest/hello]].\n", "utf8");
  fs.mkdirSync(path.join(wiki, "memroos-digest"), { recursive: true });
  fs.writeFileSync(
    path.join(wiki, "memroos-digest", "hello.md"),
    "# Hello\n\nMemRoOS wiki reader smoke.\n",
    "utf8"
  );
  fs.mkdirSync(path.join(wiki, "graph"), { recursive: true });
  fs.writeFileSync(
    path.join(wiki, "graph", "knowledge-graph.json"),
    JSON.stringify({
      generatedAt: "2026-07-18T00:00:00.000Z",
      nodes: [{ id: "hello", label: "Hello", path: "memroos-digest/hello.md" }],
      edges: [],
    }),
    "utf8"
  );
  return root;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("wiki-vault", () => {
  it("lists tree, reads pages, resolves wikilinks, and searches", () => {
    const kb = makeVault();
    const wikiRoot = getWikiRoot({ knowledgeBasePath: kb });
    const tree = listWikiTree(wikiRoot);
    expect(tree.some((n) => n.name === "index.md")).toBe(true);

    const page = readWikiPage(wikiRoot, "index.md");
    expect(page?.title).toBe("Wiki Index");
    expect(extractWikilinks(page!.content)).toContain("memroos-digest/hello");
    expect(resolveWikilink(wikiRoot, "memroos-digest/hello")).toBe("memroos-digest/hello.md");
    expect(resolveWikiPath(wikiRoot, "../outside.md")).toBeNull();

    const hits = searchWikiPages(wikiRoot, "reader smoke");
    expect(hits[0]?.path).toBe("memroos-digest/hello.md");
  });

  it("loads wiki graph and degrades when missing", () => {
    const kb = makeVault();
    const graph = loadWikiGraph({ knowledgeBasePath: kb });
    expect(graph.exists).toBe(true);
    expect(graph.nodes[0]?.path).toBe("memroos-digest/hello.md");

    const empty = loadWikiGraph({ knowledgeBasePath: path.join(os.tmpdir(), "missing-wiki-root") });
    expect(empty.exists).toBe(false);
  });
});

describe("wiki-digest", () => {
  it("registers wiki-digest in cron health defaults", () => {
    const db = new Database(":memory:");
    initSchema(db);
    const jobs = listCronHealthJobs(db);
    expect(jobs.some((job) => job.id === WIKI_DIGEST_CRON_ID)).toBe(true);
  });

  it("skips secrets and high-sensitivity scraps", () => {
    expect(shouldSkipMemory({ id: "1", content: "api_key=abc123" }).skip).toBe(true);
    expect(
      shouldSkipMemory({ id: "2", content: "normal note", sensitivity: "legal" }).skip
    ).toBe(true);
    expect(shouldSkipMemory({ id: "3", content: "Ship wiki digest" }).skip).toBe(false);
  });

  it("dry-run digests without writing watermark/pages", async () => {
    const kb = makeVault();
    const before = readWikiDigestWatermark(kb);
    const summary = await runWikiDigest({
      knowledgeBasePath: kb,
      dryRun: true,
      now: new Date("2026-07-18T12:00:00.000Z"),
      fetchMemories: async () => [
        {
          id: "m1",
          content: "Luis shipped the human wiki surface on MemRoOS.",
          createdAt: "2026-07-18T11:00:00.000Z",
          agentId: "luis",
        },
      ],
      log: () => undefined,
    });
    expect(summary.status).toBe("completed");
    expect(summary.written).toBe(1);
    expect(summary.pages.length).toBe(1);
    expect(readWikiDigestWatermark(kb).lastId).toBe(before.lastId);
    const key = clusterKeyForMemory({
      id: "m1",
      content: "Luis shipped the human wiki surface on MemRoOS.",
    });
    expect(fs.existsSync(path.join(kb, "llm-wiki", "wiki", "memroos-digest", `${key}.md`))).toBe(
      false
    );
  });

  it("writes pages, updates watermark, and refreshes graph", async () => {
    const kb = makeVault();
    const summary = await runWikiDigest({
      knowledgeBasePath: kb,
      dryRun: false,
      now: new Date("2026-07-18T12:00:00.000Z"),
      fetchMemories: async () => [
        {
          id: "m2",
          content: "Graph catchup and wiki digest work together.",
          createdAt: "2026-07-18T11:30:00.000Z",
          agentId: "luis",
        },
      ],
      log: () => undefined,
    });
    expect(summary.status).toBe("completed");
    expect(summary.written).toBe(1);
    expect(readWikiDigestWatermark(kb).lastId).toBe("m2");
    const pagePath = path.join(kb, "llm-wiki", "wiki", summary.pages[0]!);
    expect(fs.existsSync(pagePath)).toBe(true);
    const graph = loadWikiGraph({ knowledgeBasePath: kb });
    expect(graph.nodes.some((n) => n.path === summary.pages[0])).toBe(true);
  });
});
