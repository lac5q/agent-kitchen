import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { listCronHealthJobs, updateCronJobStatus } from "@/lib/cron-health";
import { WIKI_DIGEST_CRON_ID } from "@/lib/wiki-digest";

const testDb = new Database(":memory:");
initSchema(testDb);

vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock("@/lib/operator-auth", () => ({
  authorizeRegistryWrite: () => true,
  registryWriteUnauthorizedResponse: () =>
    Response.json({ ok: false, error: "unauthorized" }, { status: 403 }),
}));

const tempDirs: string[] = [];

function makeVault(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-wiki-api-"));
  tempDirs.push(root);
  const wiki = path.join(root, "llm-wiki", "wiki");
  fs.mkdirSync(path.join(wiki, "memroos-digest"), { recursive: true });
  fs.mkdirSync(path.join(wiki, "graph"), { recursive: true });
  fs.writeFileSync(path.join(wiki, "index.md"), "# Wiki Index\n\nHello wiki.\n", "utf8");
  fs.writeFileSync(
    path.join(wiki, "memroos-digest", "hello.md"),
    "# Hello\n\nSearchable wiki page.\n",
    "utf8"
  );
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

describe("wiki + observe API routes", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    testDb.exec("DELETE FROM cron_health_jobs");
    testDb.exec("DELETE FROM messages");
    listCronHealthJobs(testDb);
  });

  afterEach(() => {
    while (tempDirs.length) {
      const dir = tempDirs.pop();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
    vi.resetModules();
  });

  it("GET /api/wiki returns missing-vault status without throwing", async () => {
    vi.stubEnv("KNOWLEDGE_BASE_PATH", "/tmp/definitely-missing-wiki-root-xyz");
    const { GET } = await import("@/app/api/wiki/route");
    const res = await GET(new Request("http://localhost/api/wiki?view=tree"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.exists).toBe(false);
    expect(body.tree).toEqual([]);
  });

  it("GET /api/wiki covers status/page/search/graph/tree views", async () => {
    const kb = makeVault();
    const { GET } = await import("@/app/api/wiki/route");

    const status = await GET(
      new Request(`http://localhost/api/wiki?view=status&knowledgeBasePath=${encodeURIComponent(kb)}`)
    );
    expect((await status.json()).exists).toBe(true);

    const page = await GET(
      new Request(
        `http://localhost/api/wiki?view=page&path=index.md&knowledgeBasePath=${encodeURIComponent(kb)}`
      )
    );
    const pageBody = await page.json();
    expect(page.status).toBe(200);
    expect(pageBody.page.title).toBe("Wiki Index");

    const missing = await GET(
      new Request(
        `http://localhost/api/wiki?view=page&path=nope.md&knowledgeBasePath=${encodeURIComponent(kb)}`
      )
    );
    expect(missing.status).toBe(404);

    const search = await GET(
      new Request(
        `http://localhost/api/wiki?view=search&q=Searchable&knowledgeBasePath=${encodeURIComponent(kb)}`
      )
    );
    expect((await search.json()).hits[0].path).toBe("memroos-digest/hello.md");

    const graph = await GET(
      new Request(`http://localhost/api/wiki?view=graph&knowledgeBasePath=${encodeURIComponent(kb)}`)
    );
    expect((await graph.json()).graph.exists).toBe(true);

    const tree = await GET(
      new Request(`http://localhost/api/wiki?knowledgeBasePath=${encodeURIComponent(kb)}`)
    );
    expect((await tree.json()).tree.length).toBeGreaterThan(0);
  });

  it("GET /api/observe/health returns harness catalog including Pi", async () => {
    const { GET } = await import("@/app/api/observe/health/route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.harnesses.some((h: { harness: string }) => h.harness === "pi")).toBe(true);
  });

  it("GET /api/wiki/digest returns cron job status when authorized", async () => {
    const { GET } = await import("@/app/api/wiki/digest/route");
    const res = await GET(new Request("http://localhost/api/wiki/digest"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.job?.id).toBe("wiki-digest");
  });

  it("POST /api/wiki/digest dry-run completes and paused cron returns 409", async () => {
    const kb = makeVault();
    const { POST } = await import("@/app/api/wiki/digest/route");

    const dry = await POST(
      new Request("http://localhost/api/wiki/digest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dryRun: true,
          knowledgeBasePath: kb,
          limit: 5,
        }),
      })
    );
    const dryBody = await dry.json();
    expect(dry.status).toBe(200);
    expect(dryBody.ok).toBe(true);

    updateCronJobStatus(testDb, WIKI_DIGEST_CRON_ID, "paused");
    const paused = await POST(
      new Request("http://localhost/api/wiki/digest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ knowledgeBasePath: kb }),
      })
    );
    expect(paused.status).toBe(409);
  });

  it("POST /api/wiki/digest force bypasses paused cron", async () => {
    const kb = makeVault();
    updateCronJobStatus(testDb, WIKI_DIGEST_CRON_ID, "paused");
    const { POST } = await import("@/app/api/wiki/digest/route");
    const res = await POST(
      new Request("http://localhost/api/wiki/digest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          force: true,
          dryRun: true,
          knowledgeBasePath: kb,
        }),
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
