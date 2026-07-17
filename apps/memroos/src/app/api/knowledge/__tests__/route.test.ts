import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let root: string;
let configPath: string;

async function loadRoute() {
  vi.resetModules();
  vi.stubEnv("KNOWLEDGE_BASE_PATH", root);
  vi.stubEnv("COLLECTIONS_CONFIG_PATH", configPath);
  return import("../route");
}

describe("GET /api/knowledge", () => {
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "knowledge-route-"));
    configPath = path.join(root, "collections.config.json");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("counts configured real collections recursively with supported text extensions", async () => {
    mkdirSync(path.join(root, "skills", "nested"), { recursive: true });
    writeFileSync(path.join(root, "skills", "a.md"), "a");
    writeFileSync(path.join(root, "skills", "nested", "b.mdx"), "b");
    writeFileSync(path.join(root, "skills", "nested", "c.txt"), "c");
    writeFileSync(path.join(root, "skills", "nested", "ignore.json"), "{}");

    mkdirSync(path.join(root, "gdrive", "meet-recordings"), { recursive: true });
    writeFileSync(path.join(root, "gdrive", "meet-recordings", "call.md"), "call");
    mkdirSync(path.join(root, "apple-notes", "call-recordings"), { recursive: true });
    writeFileSync(path.join(root, "apple-notes", "call-recordings", "apple-call.txt"), "apple call");

    mkdirSync(path.join(root, "external", "memory"), { recursive: true });
    writeFileSync(path.join(root, "external", "memory", "should-not-count.md"), "external");
    symlinkSync(path.join(root, "external"), path.join(root, "skills", "external-link"), "dir");

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
          { name: "missing", category: "business" },
        ],
      })
    );

    const { GET } = await loadRoute();
    const response = await GET();
    const body = await response.json();

    expect(body.totalDocs).toBe(5);
    expect(body.totalFiles).toBe(5);
    expect(body.collections.find((collection: { name: string }) => collection.name === "skills").docCount).toBe(3);
    expect(body.collections.find((collection: { name: string }) => collection.name === "meet-recordings").docCount).toBe(2);
    expect(body.collections.find((collection: { name: string }) => collection.name === "missing").docCount).toBe(0);
  });
});

describe("GET /api/knowledge truthful metric contract (VAL-LIB-001)", () => {
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "knowledge-truthful-"));
    configPath = path.join(root, "collections.config.json");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("carries a truthful metric envelope per collection instead of inventing a zero count", async () => {
    mkdirSync(path.join(root, "skills"), { recursive: true });
    writeFileSync(path.join(root, "skills", "a.md"), "a");
    writeFileSync(configPath, JSON.stringify({
      collections: [
        { name: "skills", category: "agents" },
        { name: "missing", category: "business" },
      ],
    }));

    const { GET } = await loadRoute();
    const response = await GET();
    const body = await response.json();

    const skills = body.collections.find((c: { name: string }) => c.name === "skills");
    const missing = body.collections.find((c: { name: string }) => c.name === "missing");

    expect(skills).toEqual(expect.objectContaining({
      docCount: 1,
      metric: expect.objectContaining({
        status: "live",
        value: 1,
        scope: expect.objectContaining({ window: expect.any(String), workspace: expect.any(String) }),
        source: expect.any(String),
      }),
    }));
    expect(skills.metric.observedAt).toBeTruthy();

    // Missing (configured but no files) -> empty (healthy source, no observations)
    expect(missing).toEqual(expect.objectContaining({
      docCount: 0,
      metric: expect.objectContaining({
        status: "empty",
        reason: expect.stringMatching(/no observations|no files|empty|no markdown/i),
      }),
    }));
    // Empty is a non-live status so the truthful contract collapses value to null;
    // the operator reads docCount + status, not value.
    expect(missing.metric.value).toBeNull();
  });

  it("surfaces a top-level metric summary for totalFiles / totalCollections", async () => {
    mkdirSync(path.join(root, "skills"), { recursive: true });
    writeFileSync(path.join(root, "skills", "a.md"), "a");
    writeFileSync(configPath, JSON.stringify({
      collections: [{ name: "skills", category: "agents" }],
    }));

    const { GET } = await loadRoute();
    const response = await GET();
    const body = await response.json();

    expect(body.metrics).toBeDefined();
    expect(body.metrics.totalFiles).toMatchObject({
      status: expect.stringMatching(/^(live|empty)$/),
      value: expect.any(Number),
      source: expect.any(String),
    });
    expect(body.metrics.totalCollections).toMatchObject({
      status: expect.stringMatching(/^(live|empty)$/),
      source: expect.any(String),
    });
  });
});
