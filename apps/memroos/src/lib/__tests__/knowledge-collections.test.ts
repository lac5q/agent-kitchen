// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  collectCollectionFiles,
  collectKnowledgeFiles,
  isKnowledgeFile,
  loadCollections,
  resolveCollectionPath,
  resolveCollectionPaths,
  scanCollection,
  scanConfiguredCollection,
} from "@/lib/knowledge-collections";

let root: string;

describe("knowledge collection helpers", () => {
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "knowledge-collections-"));
    vi.stubEnv("KNOWLEDGE_BASE_PATH", root);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it("loads absolute config files and falls back to empty collections on errors", () => {
    const configPath = path.join(root, "collections.json");
    writeFileSync(configPath, JSON.stringify({ collections: [{ name: "skills", category: "agents" }] }));
    vi.stubEnv("COLLECTIONS_CONFIG_PATH", configPath);
    expect(loadCollections()).toEqual([{ name: "skills", category: "agents" }]);

    vi.stubEnv("COLLECTIONS_CONFIG_PATH", path.join(root, "missing.json"));
    expect(loadCollections()).toEqual([]);
  });

  it("resolves base paths, filters supported files, skips symlinks, and scans lastUpdated", async () => {
    mkdirSync(path.join(root, "skills", "nested"), { recursive: true });
    writeFileSync(path.join(root, "skills", "a.MD"), "a");
    writeFileSync(path.join(root, "skills", "nested", "b.txt"), "b");
    writeFileSync(path.join(root, "skills", "nested", "ignore.json"), "{}");
    mkdirSync(path.join(root, "external"), { recursive: true });
    writeFileSync(path.join(root, "external", "outside.md"), "outside");
    symlinkSync(path.join(root, "external"), path.join(root, "skills", "external-link"), "dir");

    expect(resolveCollectionPath({ name: "skills" })).toBe(path.join(root, "skills"));
    expect(resolveCollectionPaths({ name: "multi", basePaths: ["skills", path.join(root, "external")] })).toEqual([
      path.join(root, "skills"),
      path.join(root, "external"),
    ]);
    expect(isKnowledgeFile("A.MDX")).toBe(true);
    expect(isKnowledgeFile("ignore.json")).toBe(false);

    const files = await collectKnowledgeFiles(path.join(root, "skills"));
    expect(files.map((file) => path.basename(file.path)).sort()).toEqual(["a.MD", "b.txt"]);

    const scanned = await scanCollection(path.join(root, "skills"));
    expect(scanned.docCount).toBe(2);
    expect(scanned.lastUpdated).toBeInstanceOf(Date);
  });

  it("merges multiple source paths and ignores missing configured sources", async () => {
    mkdirSync(path.join(root, "one"), { recursive: true });
    mkdirSync(path.join(root, "two"), { recursive: true });
    writeFileSync(path.join(root, "one", "a.md"), "a");
    writeFileSync(path.join(root, "two", "b.txt"), "b");

    const collection = {
      name: "multi",
      category: "business" as const,
      basePaths: ["one", "missing", "two"],
    };
    const files = await collectCollectionFiles(collection);
    expect(files.map((file) => path.basename(file.path)).sort()).toEqual(["a.md", "b.txt"]);

    const scan = await scanConfiguredCollection(collection);
    expect(scan.docCount).toBe(2);
    expect(scan.lastUpdated).toBeInstanceOf(Date);
  });
});
