/**
 * SkillForge Marketplace — Phase 92, governed by VAL-SKILL-035 (Phase 151)
 * Publish, rate, and discover skills across the Memroos ecosystem.
 *
 * VAL-SKILL-035 contract:
 *   - Marketplace publication accepts only existing governed identity/hash.
 *   - Rejected/retired/incomplete/tampered skills cannot publish as dispatchable.
 *   - Listing visibility is separate from quarantine/runtime eligibility:
 *     a listing can exist (visible) while dispatch is denied. Dispatch checks
 *     stay authoritative in skill-lookup; marketplace search surfaces
 *     dispatch eligibility as is_dispatchable + denial_reason.
 *
 * All skill body data remains inert: marketplace publish does not execute,
 * forward, or re-interpret SKILL.md content.
 */

import { createHash } from "crypto";
import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillListing {
  id: string;
  skillId: string;
  name: string;
  description: string;
  author: string;
  tags: string[];
  version: string;
  changelog: string;
  rating: number;
  reviewCount: number;
  downloadCount: number;
  category: string;
  publishedAt: Date;
  updatedAt: Date;
  deprecated: boolean;
  deprecationReason?: string;
  /** VAL-SKILL-035: dispatch eligibility derived from registry at read time. */
  isDispatchable?: boolean;
  /** When isDispatchable=false, human-readable reason (not raw_body). */
  dispatchDenialReason?: string;
}

export interface SkillReview {
  id: string;
  listingId: string;
  reviewer: string;
  rating: number;
  text: string;
  verified: boolean;
  createdAt: Date;
}

export interface PublishRequest {
  skillId: string;
  name: string;
  description: string;
  author: string;
  tags: string[];
  category: string;
  changelog: string;
  /** Optional: narrow multi-harness ambiguity (VAL-SKILL-018). */
  sourceHarness?: string;
}

export interface GovernedPublishOptions {
  /** Bind to an explicit harness; resolves multi-harness ambiguity. */
  sourceHarness?: string | null;
  /** Fail-closed when skill has no signature. */
  requireSigned?: boolean;
  /** Actor for audit_entries (when present). Best-effort. */
  actor?: string;
}

export class MarketplaceGovernanceError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status = 409) {
    super(message);
    this.name = "MarketplaceGovernanceError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RegistryRow {
  id: number;
  name: string;
  source_harness: string;
  dispatch_status: string | null;
  completeness_pct: number | null;
  lifecycle_state: string | null;
  content_hash: string | null;
  raw_body: string | null;
  signature: string | null;
  version: string | null;
}

function computeHash(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

function safeJsonParseArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function findRegistryRow(
  db: Database.Database,
  opts: { skillId: string; sourceHarness?: string | null }
): RegistryRow | null {
  const skillId = (opts.skillId ?? "").trim();
  if (!skillId) return null;
  const harness = opts.sourceHarness?.trim() || null;

  // Numeric id path — many callers pass numeric registry id as string.
  const asInt = Number(skillId);
  const isNumericId = Number.isInteger(asInt) && asInt > 0 && String(asInt) === skillId;

  if (isNumericId) {
    const row = db
      .prepare<[number], RegistryRow>(
        `SELECT id, name, source_harness, dispatch_status, completeness_pct,
                lifecycle_state, content_hash, raw_body, signature, version
           FROM skill_registry
          WHERE id = ?
          LIMIT 1`
      )
      .get(asInt);
    if (row) return row;
  }

  // Name lookup
  if (harness) {
    const row = db
      .prepare<[string, string], RegistryRow>(
        `SELECT id, name, source_harness, dispatch_status, completeness_pct,
                lifecycle_state, content_hash, raw_body, signature, version
           FROM skill_registry
          WHERE name = ? AND source_harness = ?
          LIMIT 1`
      )
      .get(skillId, harness);
    return row ?? null;
  }

  // Without harness: check ambiguity first
  const distinct = db
    .prepare<[string], { source_harness: string }>(
      `SELECT DISTINCT source_harness FROM skill_registry WHERE name = ?`
    )
    .all(skillId);

  if (distinct.length > 1) {
    const harnesses = distinct.map((r) => r.source_harness).sort();
    throw new MarketplaceGovernanceError(
      `Skill name '${skillId}' exists in multiple harnesses (${harnesses.join(", ")}); supply sourceHarness to publish`,
      "ambiguous_harness",
      400
    );
  }

  const row = db
    .prepare<[string], RegistryRow>(
      `SELECT id, name, source_harness, dispatch_status, completeness_pct,
              lifecycle_state, content_hash, raw_body, signature, version
         FROM skill_registry
        WHERE name = ?
        ORDER BY imported_at DESC
        LIMIT 1`
    )
    .get(skillId);
  return row ?? null;
}

function loadQuarantineStage(db: Database.Database, skillId: number): string | null {
  try {
    const row = db
      .prepare<[number], { stage: string }>(
        `SELECT stage FROM skill_quarantine WHERE skill_id = ? LIMIT 1`
      )
      .get(skillId);
    return row?.stage ?? null;
  } catch {
    return null;
  }
}

export interface DispatchEligibility {
  eligible: boolean;
  reason?: string;
}

export function checkDispatchEligibility(row: RegistryRow | null): DispatchEligibility {
  if (!row) {
    return { eligible: false, reason: "registry row missing — cannot verify content hash or lifecycle" };
  }

  // Dispatch gate: must be enabled
  if ((row.dispatch_status ?? "") !== "enabled") {
    const ds = row.dispatch_status ?? "unknown";
    return { eligible: false, reason: `dispatch_status='${ds}' — not enabled` };
  }

  // Completeness: must be 100
  const pct = row.completeness_pct ?? 0;
  if (pct < 100) {
    return { eligible: false, reason: `incomplete (${pct}%) — cannot publish as dispatchable` };
  }

  // Lifecycle: null legacy allowed, otherwise must be enabled
  const lc = row.lifecycle_state ?? null;
  if (lc !== null && lc !== "enabled") {
    if (lc === "retired") {
      return { eligible: false, reason: `lifecycle_state='${lc}' — retired is terminal and cannot be published` };
    }
    return { eligible: false, reason: `lifecycle_state='${lc}' — not enabled` };
  }

  // Tamper: content_hash must match recomputed hash of raw_body when both present.
  if (row.content_hash && row.raw_body !== null && row.raw_body !== undefined) {
    const recomputed = computeHash(row.raw_body);
    if (recomputed.toLowerCase() !== row.content_hash.toLowerCase()) {
      return {
        eligible: false,
        reason: `tamper detected: stored hash ${row.content_hash.slice(0, 12)}... != recomputed ${recomputed.slice(0, 12)}...`,
      };
    }
  }

  return { eligible: true };
}

function checkQuarantineNotRejected(db: Database.Database, registryId: number): DispatchEligibility {
  const stage = loadQuarantineStage(db, registryId);
  if (stage === "rejected") {
    return { eligible: false, reason: "quarantine stage='rejected' — skill was rejected and cannot be published" };
  }
  return { eligible: true };
}

// ---------------------------------------------------------------------------
// Governed publish core — used by both new wrapper and modified publishSkill
// ---------------------------------------------------------------------------

function enforceRegistryBoundPublish(
  db: Database.Database,
  lookup: { skillId: string; sourceHarness?: string | null },
  opts: GovernedPublishOptions = {}
): { eligibility: DispatchEligibility; registryRow: RegistryRow } {
  const skillId = (lookup.skillId ?? "").trim();
  if (!skillId) {
    throw new MarketplaceGovernanceError("skillId is required", "missing_skill_id", 400);
  }

  const registryRow = findRegistryRow(db, {
    skillId,
    sourceHarness: opts.sourceHarness ?? lookup.sourceHarness ?? null,
  });

  if (!registryRow) {
    throw new MarketplaceGovernanceError(
      `Skill '${skillId}' not found in skill_registry — marketplace publish requires an existing governed skill`,
      "skill_not_found",
      404
    );
  }

  // Quarantine rejection check
  const quarantineCheck = checkQuarantineNotRejected(db, registryRow.id);
  if (!quarantineCheck.eligible) {
    throw new MarketplaceGovernanceError(quarantineCheck.reason!, "quarantine_rejected", 409);
  }

  // Dispatch + completeness + lifecycle + tamper
  const dispatchCheck = checkDispatchEligibility(registryRow);
  if (!dispatchCheck.eligible) {
    const msg = dispatchCheck.reason ?? "skill not dispatchable";
    const lower = msg.toLowerCase();
    if (lower.includes("tamper")) {
      throw new MarketplaceGovernanceError(msg, "tampered", 409);
    }
    if (lower.includes("retired")) {
      throw new MarketplaceGovernanceError(msg, "retired", 409);
    }
    if (lower.includes("incomplete")) {
      throw new MarketplaceGovernanceError(msg, "incomplete", 409);
    }
    throw new MarketplaceGovernanceError(msg, "not_dispatchable", 409);
  }

  // Signed requirement when policy demands it
  if (opts.requireSigned && !registryRow.signature) {
    throw new MarketplaceGovernanceError(
      "Skill is unsigned and publish policy require_signed=true",
      "unsigned",
      409
    );
  }

  return { registryRow, eligibility: { eligible: true } };
}

// ---------------------------------------------------------------------------
// Public: publishGovernedSkill (new fail-closed wrapper)
// ---------------------------------------------------------------------------

export function publishGovernedSkill(
  db: Database.Database,
  skillIdentifier: string,
  publishMeta: { name: string; description: string; author: string; tags: string[]; category: string; changelog: string },
  opts: GovernedPublishOptions = {}
): { success: boolean; listingId?: string; error?: string; code?: string } {
  try {
    const { registryRow } = enforceRegistryBoundPublish(
      db,
      { skillId: skillIdentifier, sourceHarness: opts.sourceHarness ?? null },
      opts
    );

    const listingId = `market-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const version = (registryRow.version ?? "1.0.0").trim() || "1.0.0";

    db.prepare(
      `INSERT INTO skill_marketplace (id, skill_id, name, description, author, tags, version, changelog, rating, review_count, download_count, category, published_at, updated_at, deprecated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      listingId,
      String(registryRow.id),
      publishMeta.name,
      publishMeta.description,
      publishMeta.author,
      JSON.stringify(publishMeta.tags ?? []),
      version,
      publishMeta.changelog ?? "",
      0,
      0,
      0,
      publishMeta.category ?? "general",
      now,
      now,
      0
    );

    // Best-effort audit row
    try {
      db.prepare(
        `INSERT INTO audit_entries
          (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        "default-tenant",
        (opts.actor ?? "marketplace-publisher").slice(0, 120),
        "operator",
        "skill_marketplace_published",
        "skill",
        `skill:${registryRow.id}`,
        null,
        JSON.stringify({
          listing_id: listingId,
          skill_id: registryRow.id,
          skill_name: registryRow.name,
          source_harness: registryRow.source_harness,
          version,
          content_hash: registryRow.content_hash,
        }),
        now
      );
    } catch {
      // audit table may not exist on legacy test DBs — do not fail publish
    }

    return { success: true, listingId };
  } catch (err) {
    if (err instanceof MarketplaceGovernanceError) {
      return { success: false, error: err.message, code: err.code };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// publishSkill — Phase 92 surface. Backward-compatible thin wrapper.
// NOTE: For VAL-SKILL-035 fail-closed publish, use publishGovernedSkill().
// This surface is preserved so legacy Phase 92 callers keep working; new code
// MUST go through publishGovernedSkill which enforces registry identity.
// ---------------------------------------------------------------------------

export function publishSkill(
  db: Database.Database,
  req: PublishRequest
): { success: boolean; listingId?: string; error?: string; code?: string } {
  try {
    // VAL-SKILL-035: legacy surface now also registry-bound (fail-closed) to
    // satisfy governed publication contract. Legacy callers that passed
    // arbitrary skillId will now get 404/409 instead of silent success.
    try {
      enforceRegistryBoundPublish(
        db,
        { skillId: req.skillId, sourceHarness: req.sourceHarness ?? null },
        { sourceHarness: req.sourceHarness ?? null }
      );
    } catch (e) {
      if (e instanceof MarketplaceGovernanceError) {
        return { success: false, error: e.message, code: e.code };
      }
      throw e;
    }

    const listingId = `market-${Date.now()}`;
    // Resolve registry row again for version pinning (use governed identity version)
    let version = "1.0.0";
    try {
      const reg = findRegistryRow(db, {
        skillId: req.skillId,
        sourceHarness: req.sourceHarness ?? null,
      });
      if (reg?.version) version = reg.version;
    } catch {
      // keep 1.0.0 fallback
    }

    db.prepare(
      `INSERT INTO skill_marketplace (id, skill_id, name, description, author, tags, version, changelog, rating, review_count, download_count, category, published_at, updated_at, deprecated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      listingId,
      req.skillId,
      req.name,
      req.description,
      req.author,
      JSON.stringify(req.tags),
      version,
      req.changelog,
      0,
      0,
      0,
      req.category,
      new Date().toISOString(),
      new Date().toISOString(),
      0
    );
    return { success: true, listingId };
  } catch (err) {
    if (err instanceof MarketplaceGovernanceError) {
      return { success: false, error: err.message, code: err.code };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function searchListings(
  db: Database.Database,
  options: {
    query?: string;
    category?: string;
    minRating?: number;
    sortBy?: "rating" | "downloads" | "newest";
    limit?: number;
    offset?: number;
  }
): { listings: SkillListing[]; total: number } {
  const { query, category, minRating, sortBy = "rating", limit = 20, offset = 0 } = options;
  const whereClauses: string[] = ["deprecated = 0"];
  const params: (string | number)[] = [];

  if (query) {
    whereClauses.push("(name LIKE ? OR description LIKE ?)");
    params.push(`%${query}%`, `%${query}%`);
  }
  if (category) {
    whereClauses.push("category = ?");
    params.push(category);
  }
  if (minRating !== undefined) {
    whereClauses.push("rating >= ?");
    params.push(minRating);
  }

  const where = whereClauses.join(" AND ");
  const countRow = db.prepare(`SELECT COUNT(*) as total FROM skill_marketplace WHERE ${where}`).get(...params) as { total: number };

  const sortMap = { rating: "rating DESC, review_count DESC", downloads: "download_count DESC", newest: "published_at DESC" };
  const orderBy = sortMap[sortBy] || sortMap.rating;

  const rows = db.prepare(
    `SELECT * FROM skill_marketplace WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as Array<Record<string, unknown>>;

  const listings: SkillListing[] = rows.map((r) => {
    const skillIdRaw = String(r.skill_id as string);
    let isDispatchable = true;
    let dispatchDenialReason: string | undefined;

    try {
      const asInt = Number(skillIdRaw);
      const isNumeric = Number.isInteger(asInt) && asInt > 0 && String(asInt) === skillIdRaw;
      let regRow: RegistryRow | null = null;
      if (isNumeric) {
        regRow = db
          .prepare<[number], RegistryRow>(
            `SELECT id, name, source_harness, dispatch_status, completeness_pct,
                    lifecycle_state, content_hash, raw_body, signature, version
               FROM skill_registry WHERE id = ? LIMIT 1`
          )
          .get(asInt) ?? null;
      } else {
        regRow = db
          .prepare<[string], RegistryRow>(
            `SELECT id, name, source_harness, dispatch_status, completeness_pct,
                    lifecycle_state, content_hash, raw_body, signature, version
               FROM skill_registry WHERE name = ? ORDER BY imported_at DESC LIMIT 1`
          )
          .get(skillIdRaw) ?? null;
      }

      if (!regRow) {
        isDispatchable = false;
        dispatchDenialReason = `underlying skill '${skillIdRaw}' not found in registry`;
      } else {
        const quarantineStage = loadQuarantineStage(db, regRow.id);
        if (quarantineStage === "rejected") {
          isDispatchable = false;
          dispatchDenialReason = "quarantine stage='rejected'";
        } else {
          const eligibility = checkDispatchEligibility(regRow);
          if (!eligibility.eligible) {
            isDispatchable = false;
            dispatchDenialReason = eligibility.reason;
          }
        }
      }
    } catch {
      isDispatchable = false;
      dispatchDenialReason = "dispatch eligibility check failed";
    }

    return {
      id: r.id as string,
      skillId: r.skill_id as string,
      name: r.name as string,
      description: r.description as string,
      author: r.author as string,
      tags: safeJsonParseArray(r.tags as string),
      version: r.version as string,
      changelog: r.changelog as string,
      rating: r.rating as number,
      reviewCount: r.review_count as number,
      downloadCount: r.download_count as number,
      category: r.category as string,
      publishedAt: new Date(r.published_at as string),
      updatedAt: new Date(r.updated_at as string),
      deprecated: Boolean(r.deprecated),
      deprecationReason: (r.deprecation_reason as string | null) ?? undefined,
      isDispatchable,
      dispatchDenialReason,
    };
  });

  return { listings, total: countRow.total };
}

export function submitReview(
  db: Database.Database,
  listingId: string,
  review: Omit<SkillReview, "id" | "listingId" | "createdAt">
): { success: boolean; error?: string } {
  try {
    const reviewId = `review-${Date.now()}`;
    db.prepare(
      `INSERT INTO skill_reviews (id, listing_id, reviewer, rating, text, verified, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(reviewId, listingId, review.reviewer, review.rating, review.text, review.verified ? 1 : 0, new Date().toISOString());

    const avgRow = db.prepare(
      `SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM skill_reviews WHERE listing_id = ?`
    ).get(listingId) as { avg_rating: number; count: number };

    db.prepare(
      `UPDATE skill_marketplace SET rating = ?, review_count = ?, updated_at = ? WHERE id = ?`
    ).run(avgRow.avg_rating, avgRow.count, new Date().toISOString(), listingId);

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function recordDownload(db: Database.Database, listingId: string): void {
  try {
    db.prepare(
      `UPDATE skill_marketplace SET download_count = download_count + 1, updated_at = ? WHERE id = ?`
    ).run(new Date().toISOString(), listingId);
  } catch { /* ignore */ }
}

export function deprecateSkill(db: Database.Database, listingId: string, reason: string): { success: boolean; error?: string } {
  try {
    db.prepare(
      `UPDATE skill_marketplace SET deprecated = 1, deprecation_reason = ?, updated_at = ? WHERE id = ?`
    ).run(reason, new Date().toISOString(), listingId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
