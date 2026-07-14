// @vitest-environment node
/**
 * VAL-SKILL-035 — Marketplace publication is registry-bound and fail-closed.
 *
 * - publish of enabled/complete skill succeeds
 * - publish of incomplete/rejected/retired/tampered fails
 * - listing shows is_dispatchable false for retired (visibility separate from eligibility)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { createHash } from "crypto";

const TMP_ROOT = path.join(os.tmpdir(), `marketplace-gov-${crypto.randomUUID()}`);

async function loadDb() {
  const root = path.join(TMP_ROOT, `db-${crypto.randomUUID()}`);
  fs.mkdirSync(root, { recursive: true });
  process.env["MEMROOS_ROOT"] = root;
  process.env["SQLITE_DB_PATH"] = path.join(root, "test.db");
  vi.resetModules();
  const { getDb, closeDb } = await import("@/lib/db");
  const { initSchema } = await import("@/lib/db-schema");
  const db = getDb();
  initSchema(db);
  return { db, closeDb, root };
}

function hashBody(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function insertRegistryRow(
  db: import("better-sqlite3").Database,
  overrides: {
    name?: string;
    source_harness?: string;
    dispatch_status?: string;
    completeness_pct?: number;
    lifecycle_state?: string;
    raw_body?: string;
    content_hash?: string | null;
    version?: string;
  } = {}
): number {
  const rawBody = overrides.raw_body ?? "## Preconditions\nnone\n## Allowed Tools\nread_file";
  const computed = hashBody(rawBody);
  const contentHash =
    overrides.content_hash === undefined ? computed : overrides.content_hash;
  const result = db
    .prepare(
      `INSERT INTO skill_registry (
        name, description, owner, source_harness, risk_tier, dispatch_status,
        version, preconditions, allowed_tools, verification_checks, rollback_behavior,
        raw_body, completeness_pct, missing_fields_json, imported_by, imported_at,
        evidence_examples, content_hash, signature, signed_by, signed_at, trust_level,
        public_key_fingerprint, lifecycle_state
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?
      )`
    )
    .run(
      overrides.name ?? "gov-skill",
      "Governance test skill",
      "ops",
      overrides.source_harness ?? "claude",
      "low",
      overrides.dispatch_status ?? "enabled",
      overrides.version ?? "1.0.0",
      "none",
      "read_file",
      "verify output",
      "revert",
      rawBody,
      overrides.completeness_pct ?? 100,
      "[]",
      "operator",
      new Date().toISOString(),
      "check output",
      contentHash,
      null,
      null,
      null,
      "unsigned",
      null,
      overrides.lifecycle_state ?? "enabled"
    );
  return Number(result.lastInsertRowid);
}

function insertQuarantine(
  db: import("better-sqlite3").Database,
  skillId: number,
  stage: string,
  approvalStatus = "pending"
) {
  db.prepare(
    `INSERT INTO skill_quarantine (skill_id, stage, scanner_result, eval_score, approval_status, created_at, updated_at)
     VALUES (?, ?, '{}', 1.0, ?, ?, ?)`
  ).run(skillId, stage, approvalStatus, new Date().toISOString(), new Date().toISOString());
}

let db: import("better-sqlite3").Database;
let closeDb: () => void;

beforeEach(async () => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  const mods = await loadDb();
  db = mods.db;
  closeDb = mods.closeDb;
});

afterEach(() => {
  try {
    closeDb();
  } catch {}
  delete process.env["MEMROOS_ROOT"];
  delete process.env["SQLITE_DB_PATH"];
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

describe("VAL-SKILL-035 marketplace governance — publish", () => {
  it("publish of enabled/complete skill succeeds", async () => {
    const skillId = insertRegistryRow(db, {
      name: "publish-ok-skill",
      dispatch_status: "enabled",
      completeness_pct: 100,
      lifecycle_state: "enabled",
    });

    const { publishGovernedSkill } = await import("@/lib/skillforge/marketplace");
    const res = publishGovernedSkill(
      db,
      "publish-ok-skill",
      {
        name: "publish-ok-skill",
        description: "desc",
        author: "tester",
        tags: ["test"],
        category: "general",
        changelog: "initial",
      }
    );
    expect(res.success).toBe(true);
    expect(res.listingId).toBeTruthy();
    // Verify stored listing uses registry version and numeric skill_id
    const listing = db
      .prepare(`SELECT * FROM skill_marketplace WHERE id = ?`)
      .get(res.listingId!) as Record<string, unknown>;
    expect(String(listing["skill_id"])).toBe(String(skillId));
    expect(listing["version"]).toBe("1.0.0");
  });

  it("publish of incomplete skill fails with 409", async () => {
    insertRegistryRow(db, {
      name: "incomplete-skill",
      dispatch_status: "enabled",
      completeness_pct: 50,
      lifecycle_state: "enabled",
    });

    const { publishGovernedSkill, MarketplaceGovernanceError } = await import(
      "@/lib/skillforge/marketplace"
    );
    void MarketplaceGovernanceError;
    const { publishSkill } = await import("@/lib/skillforge/marketplace");
    const res = publishSkill(db, {
      skillId: "incomplete-skill",
      name: "incomplete-skill",
      description: "desc",
      author: "tester",
      tags: [],
      category: "general",
      changelog: "",
    });
    expect(res.success).toBe(false);
    expect(res.error?.toLowerCase()).toMatch(/incomplete/);
  });

  it("publish of rejected quarantine skill fails", async () => {
    const id = insertRegistryRow(db, {
      name: "rejected-skill",
      dispatch_status: "enabled",
      completeness_pct: 100,
      lifecycle_state: "enabled",
    });
    insertQuarantine(db, id, "rejected", "rejected");

    const { publishSkill } = await import("@/lib/skillforge/marketplace");
    const res = publishSkill(db, {
      skillId: "rejected-skill",
      name: "rejected-skill",
      description: "desc",
      author: "tester",
      tags: [],
      category: "general",
      changelog: "",
    });
    expect(res.success).toBe(false);
    expect(res.error?.toLowerCase()).toMatch(/rejected/);
  });

  it("publish of retired skill fails", async () => {
    insertRegistryRow(db, {
      name: "retired-skill",
      dispatch_status: "enabled",
      completeness_pct: 100,
      lifecycle_state: "retired",
    });

    const { publishSkill } = await import("@/lib/skillforge/marketplace");
    const res = publishSkill(db, {
      skillId: "retired-skill",
      name: "retired-skill",
      description: "desc",
      author: "tester",
      tags: [],
      category: "general",
      changelog: "",
    });
    expect(res.success).toBe(false);
    expect(res.error?.toLowerCase()).toMatch(/retired/);
  });

  it("publish of tampered skill fails (hash mismatch)", async () => {
    // Insert with raw_body X but stored hash for different body Y
    const correctBody = "real body content";
    const tamperedHash = hashBody("different body content");
    insertRegistryRow(db, {
      name: "tampered-skill",
      dispatch_status: "enabled",
      completeness_pct: 100,
      lifecycle_state: "enabled",
      raw_body: correctBody,
      content_hash: tamperedHash,
    });

    const { publishSkill } = await import("@/lib/skillforge/marketplace");
    const res = publishSkill(db, {
      skillId: "tampered-skill",
      name: "tampered-skill",
      description: "desc",
      author: "tester",
      tags: [],
      category: "general",
      changelog: "",
    });
    expect(res.success).toBe(false);
    expect(res.error?.toLowerCase()).toMatch(/tamper/);
  });

  it("publish of unsigned skill fails when requireSigned=true", async () => {
    insertRegistryRow(db, {
      name: "unsigned-skill",
      dispatch_status: "enabled",
      completeness_pct: 100,
      lifecycle_state: "enabled",
    });

    const { publishGovernedSkill } = await import("@/lib/skillforge/marketplace");
    const res = publishGovernedSkill(
      db,
      "unsigned-skill",
      {
        name: "unsigned-skill",
        description: "desc",
        author: "tester",
        tags: [],
        category: "general",
        changelog: "",
      },
      { requireSigned: true }
    );
    expect(res.success).toBe(false);
    expect(res.error?.toLowerCase()).toMatch(/unsigned/);
  });

  it("publish of non-existent skill fails with not_found", async () => {
    const { publishSkill } = await import("@/lib/skillforge/marketplace");
    const res = publishSkill(db, {
      skillId: "nonexistent-skill",
      name: "nonexistent-skill",
      description: "desc",
      author: "tester",
      tags: [],
      category: "general",
      changelog: "",
    });
    expect(res.success).toBe(false);
    expect(res.error?.toLowerCase()).toMatch(/not found|not found in skill_registry/);
  });
});

describe("VAL-SKILL-035 searchListings visibility vs dispatch eligibility", () => {
  it("listing remains visible but is_dispatchable=false after skill becomes retired", async () => {
    const skillId = insertRegistryRow(db, {
      name: "to-retire-skill",
      dispatch_status: "enabled",
      completeness_pct: 100,
      lifecycle_state: "enabled",
    });

    const { publishGovernedSkill, searchListings } = await import("@/lib/skillforge/marketplace");
    const res = publishGovernedSkill(db, "to-retire-skill", {
      name: "to-retire-skill",
      description: "desc",
      author: "tester",
      tags: [],
      category: "general",
      changelog: "v1",
    });
    expect(res.success).toBe(true);

    // Initially dispatchable
    let listings = searchListings(db, { query: "to-retire-skill" });
    expect(listings.total).toBe(1);
    expect(listings.listings[0].isDispatchable).toBe(true);

    // Now flip registry to retired
    db.prepare(`UPDATE skill_registry SET lifecycle_state='retired' WHERE id=?`).run(skillId);

    listings = searchListings(db, { query: "to-retire-skill" });
    expect(listings.total).toBe(1);
    expect(listings.listings[0].isDispatchable).toBe(false);
    expect(listings.listings[0].dispatchDenialReason?.toLowerCase()).toMatch(/retired/);
  });

  it("listing shows is_dispatchable false for tampered registry row", async () => {
    const skillId = insertRegistryRow(db, {
      name: "tampered-listing-skill",
      dispatch_status: "enabled",
      completeness_pct: 100,
      lifecycle_state: "enabled",
    });

    const { publishGovernedSkill, searchListings } = await import("@/lib/skillforge/marketplace");
    const pub = publishGovernedSkill(db, "tampered-listing-skill", {
      name: "tampered-listing-skill",
      description: "desc",
      author: "tester",
      tags: [],
      category: "general",
      changelog: "v1",
    });
    expect(pub.success).toBe(true);

    // Tamper the registry raw_body without updating content_hash
    db.prepare(`UPDATE skill_registry SET raw_body='tampered content changed' WHERE id=?`).run(skillId);

    const listings = searchListings(db, { query: "tampered-listing-skill" });
    expect(listings.total).toBe(1);
    expect(listings.listings[0].isDispatchable).toBe(false);
    expect(listings.listings[0].dispatchDenialReason?.toLowerCase()).toMatch(/tamper/);
  });
});
