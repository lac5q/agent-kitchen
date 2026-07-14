/**
 * SkillForge Marketplace tests — Phase 92
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { publishSkill, searchListings, submitReview, recordDownload, deprecateSkill } from "../marketplace";

function setupDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE skill_registry (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      owner TEXT,
      source_harness TEXT NOT NULL DEFAULT 'claude',
      risk_tier TEXT,
      dispatch_status TEXT NOT NULL DEFAULT 'enabled',
      version TEXT,
      preconditions TEXT,
      allowed_tools TEXT,
      verification_checks TEXT,
      rollback_behavior TEXT,
      raw_body TEXT NOT NULL DEFAULT '',
      completeness_pct INTEGER NOT NULL DEFAULT 100,
      missing_fields_json TEXT NOT NULL DEFAULT '[]',
      imported_by TEXT NOT NULL DEFAULT 'operator',
      imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      evidence_examples TEXT,
      content_hash TEXT,
      signature TEXT,
      signed_by TEXT,
      signed_at TEXT,
      trust_level TEXT NOT NULL DEFAULT 'unsigned',
      public_key_fingerprint TEXT,
      lifecycle_state TEXT NOT NULL DEFAULT 'enabled',
      UNIQUE(name, source_harness)
    );
    CREATE TABLE skill_marketplace (
      id TEXT PRIMARY KEY, skill_id TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT NOT NULL, author TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]',
      version TEXT NOT NULL, changelog TEXT NOT NULL DEFAULT '', rating REAL NOT NULL DEFAULT 0,
      review_count INTEGER NOT NULL DEFAULT 0, download_count INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL, published_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      deprecated INTEGER NOT NULL DEFAULT 0, deprecation_reason TEXT
    );
    CREATE TABLE skill_reviews (
      id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, reviewer TEXT NOT NULL,
      rating INTEGER NOT NULL, text TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

function registerSkill(db: Database.Database, name: string, version: string = '1.0.0'): void {
  db.prepare(
    `INSERT INTO skill_registry (name, source_harness, dispatch_status, raw_body, imported_by, version) VALUES (?, 'claude', 'enabled', ?, 'operator', ?)`
  ).run(name, `body-${name}`, version);
}

describe("marketplace", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = setupDb();
  });

  it("publishes a skill", () => {
    registerSkill(db, "skill-1");
    const result = publishSkill(db, {
      skillId: "skill-1",
      name: "Test Skill",
      description: "A test skill",
      author: "tester",
      tags: ["test"],
      category: "testing",
      changelog: "Initial release",
    });
    expect(result.success).toBe(true);
    expect(result.listingId).toBeTruthy();
  });

  it("searches listings by query", () => {
    registerSkill(db, "s1");
    registerSkill(db, "s2");
    publishSkill(db, { skillId: "s1", name: "Alpha", description: "First skill", author: "a", tags: [], category: "cat", changelog: "" });
    publishSkill(db, { skillId: "s2", name: "Beta", description: "Second skill", author: "a", tags: [], category: "cat", changelog: "" });

    const results = searchListings(db, { query: "Alpha" });
    expect(results.total).toBe(1);
    expect(results.listings[0].name).toBe("Alpha");
  });

  it("submits a review and updates rating", () => {
    registerSkill(db, "s1");
    const pub = publishSkill(db, { skillId: "s1", name: "Skill", description: "Desc", author: "a", tags: [], category: "cat", changelog: "" });

    const review = submitReview(db, pub.listingId!, { reviewer: "user1", rating: 5, text: "Great!", verified: true });
    expect(review.success).toBe(true);

    const results = searchListings(db, {});
    expect(results.listings[0].rating).toBe(5);
    expect(results.listings[0].reviewCount).toBe(1);
  });

  it("records downloads", () => {
    registerSkill(db, "s1");
    const pub = publishSkill(db, { skillId: "s1", name: "Skill", description: "Desc", author: "a", tags: [], category: "cat", changelog: "" });
    recordDownload(db, pub.listingId!);

    const results = searchListings(db, {});
    expect(results.listings[0].downloadCount).toBe(1);
  });

  it("deprecates a skill", () => {
    registerSkill(db, "s1");
    const pub = publishSkill(db, { skillId: "s1", name: "Skill", description: "Desc", author: "a", tags: [], category: "cat", changelog: "" });
    deprecateSkill(db, pub.listingId!, "Outdated");

    const results = searchListings(db, {});
    expect(results.total).toBe(0);
  });
});
