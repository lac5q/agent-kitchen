import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let root: string;
let configPath: string;

async function loadRoute() {
  vi.resetModules();
  vi.stubEnv("KNOWLEDGE_BASE_PATH", root);
  vi.stubEnv("COLLECTIONS_CONFIG_PATH", configPath);
  return import("../trends/route");
}

function touch(filePath: string, date: Date) {
  writeFileSync(filePath, "content");
  utimesSync(filePath, date, date);
}

describe("GET /api/knowledge/trends", () => {
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "knowledge-trends-"));
    configPath = path.join(root, "collections.config.json");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it("returns zero-filled per-collection activity buckets for supported files", async () => {
    mkdirSync(path.join(root, "skills"), { recursive: true });
    mkdirSync(path.join(root, "gdrive", "meet-recordings"), { recursive: true });
    mkdirSync(path.join(root, "apple-notes", "call-recordings"), { recursive: true });
    touch(path.join(root, "skills", "one.md"), new Date());
    touch(path.join(root, "skills", "two.mdx"), new Date());
    touch(path.join(root, "skills", "ignore.json"), new Date());
    touch(path.join(root, "gdrive", "meet-recordings", "call.txt"), new Date());
    touch(path.join(root, "apple-notes", "call-recordings", "apple-call.md"), new Date());
    writeFileSync(
      configPath,
      JSON.stringify({
        collections: [
          { name: "skills", category: "agents" },
          {
            name: "meet-recordings",
            category: "business",
            basePaths: ["gdrive/meet-recordings", "apple-notes/call-recordings"],
          },
        ],
      })
    );

    const { GET } = await loadRoute();
    const response = await GET(new Request("http://localhost/api/knowledge/trends?window=week&limit=2") as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.window).toBe("week");
    expect(body.buckets).toHaveLength(7);
    expect(body.collections).toHaveLength(2);
    const skills = body.collections.find((collection: { name: string }) => collection.name === "skills");
    expect(skills.totalFiles).toBe(2);
    expect(skills.recentFiles).toBe(2);
    expect(skills.points).toHaveLength(7);
    expect(skills.points.reduce((sum: number, point: { value: number }) => sum + point.value, 0)).toBe(2);
    const meetings = body.collections.find((collection: { name: string }) => collection.name === "meet-recordings");
    expect(meetings.totalFiles).toBe(2);
    expect(meetings.recentFiles).toBe(2);
  });

  it("rejects unsupported windows", async () => {
    writeFileSync(configPath, JSON.stringify({ collections: [] }));
    const { GET } = await loadRoute();

    const response = await GET(new Request("http://localhost/api/knowledge/trends?window=year") as any);

    expect(response.status).toBe(400);
  });

  it("uses day buckets and clamps invalid limits to the default", async () => {
    mkdirSync(path.join(root, "skills"), { recursive: true });
    touch(path.join(root, "skills", "hourly.md"), new Date());
    writeFileSync(configPath, JSON.stringify({
      collections: [
        { name: "skills", category: "agents" },
        { name: "empty", category: "business" },
      ],
    }));

    const { GET } = await loadRoute();
    const response = await GET(new Request("http://localhost/api/knowledge/trends?window=day&limit=not-a-number") as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.window).toBe("day");
    expect(body.buckets).toHaveLength(24);
    expect(body.collections).toHaveLength(2);
    expect(body.collections[0].points).toHaveLength(24);
    expect(body.collections[0].recentFiles).toBe(1);
    expect(body.collections[1]).toMatchObject({ name: "empty", totalFiles: 0, recentFiles: 0 });
  });
});
