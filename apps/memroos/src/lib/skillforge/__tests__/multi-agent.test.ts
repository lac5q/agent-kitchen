/**
 * SkillForge Multi-Agent tests — Phase 93
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { exportSkillPackage, importSkillPackage, syncSkillsWithAgent } from "../multi-agent";

function setupDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE skill_registry (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, content TEXT NOT NULL,
      version TEXT, author TEXT, tags TEXT, imported_at TEXT
    );
    CREATE TABLE eval_receipts (
      id INTEGER PRIMARY KEY, skill_id TEXT, provider TEXT, model TEXT,
      dimensions TEXT, timestamp TEXT
    );
    CREATE TABLE skill_sync_log (
      id INTEGER PRIMARY KEY, skill_id TEXT, target_agent TEXT,
      package_id TEXT, status TEXT, timestamp TEXT
    );
  `);
  return db;
}

describe("multi-agent", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = setupDb();
  });

  it("exports a skill package", () => {
    db.prepare("INSERT INTO skill_registry (id, name, content, version, author, tags, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(1, "Test Skill", "content", "1.0", "author", "[]", new Date().toISOString());

    const result = exportSkillPackage(db, "1");
    expect(result.success).toBe(true);
    expect(result.package).toBeTruthy();
    expect(result.package!.skillId).toBe("1");
    expect(result.package!.compatibility).toContain("memroos");
  });

  it("imports a valid skill package", () => {
    const pkg = {
      id: "pkg-1", skillId: "s1", name: "Imported", content: "test",
      metadata: { version: "1.0", author: "a", tags: [], evalReceipts: [{ provider: "cloud", model: "gpt-4", dimensions: { goal: 0.8, depth: 0.8, specificity: 0.8, safety: 0.8, correctness: 0.8 }, timestamp: new Date().toISOString() }] },
      compatibility: ["memroos"], exportedAt: new Date().toISOString(),
    };

    const result = importSkillPackage(db, pkg as any);
    expect(result.success).toBe(true);
    expect(result.validationPassed).toBe(true);
  });

  it("rejects incompatible skill package", () => {
    const pkg = {
      id: "pkg-1", skillId: "s1", name: "Imported", content: "test",
      metadata: { version: "1.0", author: "a", tags: [], evalReceipts: [] },
      compatibility: ["codex"], exportedAt: new Date().toISOString(),
    };

    const result = importSkillPackage(db, pkg);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("not compatible"))).toBe(true);
  });

  it("syncs skills with agent", () => {
    db.prepare("INSERT INTO skill_registry (id, name, content, version, author, tags, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(1, "Test", "content", "1.0", "a", "[]", new Date().toISOString());

    const result = syncSkillsWithAgent(db, "http://agent-2.local", ["1"]);
    expect(result.synced).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("returns typed export failures for missing skills and malformed registry rows", () => {
    expect(exportSkillPackage(db, "404")).toMatchObject({
      success: false,
      error: "Skill not found",
    });

    db.prepare("INSERT INTO skill_registry (id, name, content, version, author, tags, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(2, "Broken Tags", "content", "1.0", "author", "{not-json", new Date().toISOString());

    const result = exportSkillPackage(db, "2");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("collects validation errors before import and surfaces insert failures separately", () => {
    const invalid = importSkillPackage(db, {
      id: "pkg-invalid",
      skillId: "",
      name: "Missing",
      content: "",
      metadata: { version: "", author: "a", tags: [], evalReceipts: [] },
      compatibility: ["codex"],
      exportedAt: new Date().toISOString(),
    });

    expect(invalid).toMatchObject({
      success: false,
      validationPassed: false,
    });
    expect(invalid.errors).toEqual(
      expect.arrayContaining([
        "Missing required fields: skillId, content",
        "Missing metadata.version",
        "Skill not compatible with memroos",
        "Eval validation failed: no passing eval receipts",
      ]),
    );

    db.prepare("INSERT INTO skill_registry (id, name, content, version, author, tags, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(3, "Existing", "content", "1.0", "author", "[]", new Date().toISOString());

    const duplicate = importSkillPackage(db, {
      id: "pkg-dup",
      skillId: "3",
      name: "Duplicate",
      content: "content",
      metadata: {
        version: "1.0",
        author: "author",
        tags: ["x"],
        evalReceipts: [
          {
            provider: "fixture",
            model: "model",
            dimensions: { goal: 0.6, depth: 0.7 },
            timestamp: new Date().toISOString(),
          },
        ],
      },
      compatibility: ["memroos"],
      exportedAt: new Date().toISOString(),
    });

    expect(duplicate.success).toBe(false);
    expect(duplicate.validationPassed).toBe(true);
    expect(duplicate.errors.join("\n")).toMatch(/UNIQUE|constraint/i);
  });

  it("syncSkillsWithAgent reports export and sync-log failures without stopping the batch", () => {
    db.prepare("INSERT INTO skill_registry (id, name, content, version, author, tags, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(4, "Syncable", "content", "1.0", "a", "[]", new Date().toISOString());
    db.prepare("DROP TABLE skill_sync_log").run();

    const result = syncSkillsWithAgent(db, "http://agent.local", ["missing", "4"]);

    expect(result).toMatchObject({ success: false, synced: 0 });
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Failed to export missing: Skill not found",
        expect.stringContaining("Failed to log sync for 4:"),
      ]),
    );
  });
});
