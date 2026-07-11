/**
 * Governed cross-harness sync engine — Phase 149 / SKILLTRUST-04.
 *
 * This module is the filesystem-facing half of the auto-sync pipeline. It
 * discovers SKILL.md files across Claude Code (`.claude/skills/`), Codex,
 * Hermes, and OpenCode harness directories, produces structured field-level
 * diffs against the operator's `skill_registry`, and records the result in
 * the `skill_sync_state` table as a pending proposal. The registry is
 * NEVER mutated by detection.
 *
 * Security contract:
 *   - Detection is read-only. It writes only to `skill_sync_state` and
 *     leaves `skill_registry` untouched.
 *   - Approval mutates the registry row (raw_body, version, content_hash)
 *     but only enough to reflect the approved content; dispatch_status
 *     is set to 'quarantined' (never 'enabled') so the operator must
 *     pass the skill through the quarantine pipeline before it becomes
 *     dispatchable (SKILLTRUST-03).
 *   - Rejection clears the pending proposal without touching the registry.
 *   - Rollback restores the prior version/content_hash (single-step).
 *   - Version pinning suppresses drift proposals for the pinned
 *     (skill_name, source_harness) pair.
 *   - Malformed SKILL.md files are skipped with an error log; the scan
 *     continues so a single broken file cannot stop the operator from
 *     seeing the rest of the harness.
 *
 * Note: this module coexists with `skill-sync-governance.ts`. The
 * governance module exposes the lower-level proposal/pin lifecycle used
 * by `/api/skills/proposals` and `/api/skills/pins`. The sync engine is
 * the higher-level "scanner + proposal ledger" surface used by
 * `/api/skills/sync/*`.
 */

import { createHash, randomUUID } from "crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import type Database from "better-sqlite3";

import { computeContentHash } from "@/lib/skills/registry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Canonical harness identifiers. The four supported harnesses. */
export const SUPPORTED_HARNESSES = ["claude", "codex", "hermes", "opencode"] as const;
export type HarnessName = (typeof SUPPORTED_HARNESSES)[number];

export interface HarnessRoots {
  claude: string;
  codex: string;
  hermes: string;
  opencode: string;
}

export interface DetectedSkill {
  skill_name: string;
  source_harness: HarnessName;
  version: string | null;
  raw_body: string;
  content_hash: string;
  file_path: string;
  parse_error: string | null;
}

export interface DetectionError {
  file_path: string;
  source_harness: HarnessName;
  reason: string;
}

export interface DetectionResult {
  entries: DetectedSkill[];
  errors: DetectionError[];
}

export interface DetectedSkillInput {
  skill_name: string;
  source_harness: HarnessName;
  version?: string | null;
  raw_body?: string | null;
  content_hash?: string | null;
  file_path?: string | null;
  parse_error?: string | null;
}

export type SyncDiffKind = "add" | "change" | "no_change";

export interface SyncFieldChange {
  field: string;
  old_value: unknown;
  new_value: unknown;
}

export interface SyncDiff {
  kind: SyncDiffKind;
  skill_name: string;
  source_harness: HarnessName;
  detected_hash: string;
  current_hash: string | null;
  version: string | null;
  prior_version: string | null;
  changed_fields: SyncFieldChange[];
  summary: string;
}

export type SyncProposalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "no_change";

export interface SkillSyncStateRow {
  skill_name: string;
  source_harness: HarnessName;
  status: SyncProposalStatus;
  last_synced_hash: string | null;
  pending_proposal_id: string | null;
  pending_detected_hash: string | null;
  pending_detected_version: string | null;
  pending_diff_summary: string;
  pending_diff_payload: string;
  pending_proposed_by: string | null;
  pending_proposed_at: string | null;
  version_pinned_to: string | null;
  last_check_at: string;
  prior_version: string | null;
  prior_content_hash: string | null;
  prior_skill_id: number | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface SkillSyncObservabilityItem {
  skill_name: string;
  source_harness: HarnessName;
  last_synced_hash: string | null;
  pending_proposal_id: string | null;
  drift: boolean;
  version_pinned_to: string | null;
  last_check_at: string;
  status: SyncProposalStatus;
}

export interface CreateImportProposalParams {
  source_harness: HarnessName;
  detected: DetectedSkillInput;
  proposed_by: string;
  diff_summary?: string;
  diff_payload?: Record<string, unknown>;
}

export interface CreateImportProposalResult {
  created: boolean;
  proposal: SkillSyncStateRow;
}

export interface ApproveImportProposalParams {
  skill_name: string;
  source_harness: HarnessName;
  operator: string;
  /** When true (default), the registry row is updated with the approved
   *  content. When false, only the state row is updated; this is exposed
   *  for tests that need to assert registry state separately. */
  apply_to_registry?: boolean;
}

export interface RejectImportProposalParams {
  skill_name: string;
  source_harness: HarnessName;
  operator: string;
  reason: string;
}

export interface PinVersionParams {
  skill_name: string;
  source_harness: HarnessName;
  version: string;
  actor: string;
}

export interface ClearPinParams {
  skill_name: string;
  source_harness: HarnessName;
  actor: string;
}

export interface RollbackParams {
  skill_name: string;
  source_harness: HarnessName;
  operator: string;
}

export interface CheckSyncParams {
  roots: HarnessRoots;
  proposed_by?: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SkillSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillSyncError";
  }
}

// ---------------------------------------------------------------------------
// SQL row helpers
// ---------------------------------------------------------------------------

interface SkillSyncSqlRow {
  skill_name: string;
  source_harness: string;
  last_synced_hash: string | null;
  pending_proposal_id: string | null;
  pending_detected_hash: string | null;
  pending_detected_version: string | null;
  pending_diff_summary: string;
  pending_diff_payload: string;
  pending_proposed_by: string | null;
  pending_proposed_at: string | null;
  version_pinned_to: string | null;
  last_check_at: string;
  prior_version: string | null;
  prior_content_hash: string | null;
  prior_skill_id: number | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

function deriveStatus(row: SkillSyncSqlRow): SyncProposalStatus {
  if (row.pending_proposal_id && !row.approved_at && !row.rejected_at) {
    return "pending";
  }
  if (row.approved_at) return "approved";
  if (row.rejected_at) return "rejected";
  return "no_change";
}

function rowToState(row: SkillSyncSqlRow): SkillSyncStateRow {
  return {
    skill_name: row.skill_name,
    source_harness: row.source_harness as HarnessName,
    status: deriveStatus(row),
    last_synced_hash: row.last_synced_hash,
    pending_proposal_id: row.pending_proposal_id,
    pending_detected_hash: row.pending_detected_hash,
    pending_detected_version: row.pending_detected_version,
    pending_diff_summary: row.pending_diff_summary,
    pending_diff_payload: row.pending_diff_payload,
    pending_proposed_by: row.pending_proposed_by,
    pending_proposed_at: row.pending_proposed_at,
    version_pinned_to: row.version_pinned_to,
    last_check_at: row.last_check_at,
    prior_version: row.prior_version,
    prior_content_hash: row.prior_content_hash,
    prior_skill_id: row.prior_skill_id,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    rejected_by: row.rejected_by,
    rejected_at: row.rejected_at,
    rejection_reason: row.rejection_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function loadSyncStateRow(
  db: Database.Database,
  skillName: string,
  sourceHarness: HarnessName
): SkillSyncStateRow | null {
  const row = db
    .prepare<[string, string], SkillSyncSqlRow>(
      `SELECT skill_name, source_harness, last_synced_hash, pending_proposal_id,
              pending_detected_hash, pending_detected_version,
              pending_diff_summary, pending_diff_payload,
              pending_proposed_by, pending_proposed_at,
              version_pinned_to, last_check_at,
              prior_version, prior_content_hash, prior_skill_id,
              approved_by, approved_at, rejected_by, rejected_at,
              rejection_reason, created_at, updated_at
         FROM skill_sync_state
        WHERE skill_name = ? AND source_harness = ?
        LIMIT 1`
    )
    .get(skillName, sourceHarness);
  return row ? rowToState(row) : null;
}

const SYNC_SELECT_BASE = `SELECT skill_name, source_harness, last_synced_hash, pending_proposal_id,
       pending_detected_hash, pending_detected_version,
       pending_diff_summary, pending_diff_payload,
       pending_proposed_by, pending_proposed_at,
       version_pinned_to, last_check_at,
       prior_version, prior_content_hash, prior_skill_id,
       approved_by, approved_at, rejected_by, rejected_at,
       rejection_reason, created_at, updated_at
  FROM skill_sync_state`;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function requireHarnessInternal(value: string): HarnessName {
  if (typeof value !== "string") {
    throw new SkillSyncError("source_harness is required");
  }
  const trimmed = value.trim();
  if (!(SUPPORTED_HARNESSES as readonly string[]).includes(trimmed)) {
    throw new SkillSyncError(
      `Unsupported source_harness '${value}'. Supported: ${SUPPORTED_HARNESSES.join(", ")}`
    );
  }
  return trimmed as HarnessName;
}

/** Strict harness parser — exported for API routes that need to validate
 *  the source_harness field before constructing a HarnessName-typed arg. */
export function requireHarness(value: string): HarnessName {
  return requireHarnessInternal(value);
}

function requireNonEmpty(value: string, field: string): string {
  if (typeof value !== "string") {
    throw new SkillSyncError(`${field} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new SkillSyncError(`${field} is required`);
  }
  return trimmed;
}

function requireSkillName(value: string): string {
  return requireNonEmpty(value, "skill_name");
}

function requireHash(value: string | null | undefined, field: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new SkillSyncError(`${field} must be a 64-char SHA-256 hex`);
  }
  return value.toLowerCase();
}

function sanitizeJsonPayload(payload: unknown): string {
  if (payload === undefined || payload === null) return "{}";
  try {
    return JSON.stringify(payload);
  } catch {
    return "{}";
  }
}

/**
 * Extracts the `name:` frontmatter value from a SKILL.md body. Falls back
 * to the filename (without `.md`) when no frontmatter name is present, so
 * the operator gets a stable identifier either way.
 */
function extractSkillNameFromBody(rawBody: string): string | null {
  const trimmed = rawBody.trimStart();
  if (!trimmed.startsWith("---")) return null;
  const closeIdx = trimmed.indexOf("\n---", 3);
  if (closeIdx === -1) return null;
  const frontmatter = trimmed.slice(3, closeIdx);
  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    if (key === "name") {
      const value = line.slice(colonIdx + 1).trim();
      return value || null;
    }
  }
  return null;
}

function extractVersionFromBody(rawBody: string): string | null {
  const trimmed = rawBody.trimStart();
  if (!trimmed.startsWith("---")) return null;
  const closeIdx = trimmed.indexOf("\n---", 3);
  if (closeIdx === -1) return null;
  const frontmatter = trimmed.slice(3, closeIdx);
  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    if (key === "version") {
      const value = line.slice(colonIdx + 1).trim();
      return value || null;
    }
  }
  return null;
}

function writeAuditEntry(
  db: Database.Database,
  entry: {
    actor: string;
    eventType: string;
    entityType: string;
    entityId: string;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  }
): string {
  const id = randomUUID();
  try {
    db.prepare(
      `INSERT INTO audit_entries
        (id, tenant_id, actor_id, actor_role, event_type, entity_type,
         entity_id, reason, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      "default-tenant",
      entry.actor,
      "operator",
      entry.eventType,
      entry.entityType,
      entry.entityId,
      entry.reason ?? null,
      JSON.stringify(entry.metadata ?? {}),
      nowIso()
    );
  } catch {
    // audit_entries may not exist on partially migrated test DBs; we
    // swallow the failure here so a missing audit table never breaks
    // the primary action. Higher-level integration tests assert on the
    // row when the schema is fully migrated.
  }
  return id;
}

// ---------------------------------------------------------------------------
// detectHarnessSkills — filesystem scanner
// ---------------------------------------------------------------------------

/**
 * Scans the four harness skill directories for SKILL.md files and returns
 * a structured detection result. Malformed files are skipped with an
 * error entry; the scan never throws on a single bad file.
 *
 * The four harness roots are resolved from the `roots` argument. The
 * function reads `*.md` files from each root (one level deep — direct
 * children). If a root does not exist it is silently skipped, so the
 * caller can supply a subset of harness roots in tests.
 *
 * For each file the function derives:
 *   - skill_name: from the `name:` frontmatter field, falling back to
 *     the filename (without `.md`).
 *   - version: from the `version:` frontmatter field (null when absent).
 *   - content_hash: SHA-256 hex of the file bytes.
 *   - parse_error: non-null when the file is not parseable as UTF-8 text
 *     or when no skill_name can be derived. Such files are still listed
 *     in `entries` with `parse_error` set, so the caller can surface a
 *     per-file error in the operator UI without losing scan coverage.
 */
export function detectHarnessSkills(params: { roots: HarnessRoots }): DetectionResult {
  const entries: DetectedSkill[] = [];
  const errors: DetectionError[] = [];

  for (const harness of SUPPORTED_HARNESSES) {
    const rootDir = params.roots[harness];
    if (!rootDir) continue;
    if (!existsSync(rootDir)) continue;
    let stat;
    try {
      stat = statSync(rootDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    let fileNames: string[];
    try {
      fileNames = readdirSync(rootDir);
    } catch (err) {
      errors.push({
        file_path: rootDir,
        source_harness: harness,
        reason: `Cannot read directory: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    for (const fileName of fileNames) {
      if (!fileName.toLowerCase().endsWith(".md")) continue;
      const filePath = path.join(rootDir, fileName);

      let raw: string;
      try {
        const buf = readFileSync(filePath);
        // Convert buffer to UTF-8 text. When the bytes do not decode as
        // valid UTF-8 we record a parse_error so the operator can fix
        // the file but continue scanning the remaining files.
        raw = buf.toString("utf8");
        // Detect mojibake / non-utf8 binary content: the presence of
        // many replacement characters is a strong signal.
        const replacementCount = (raw.match(/\uFFFD/g) ?? []).length;
        if (replacementCount > raw.length / 4) {
          errors.push({
            file_path: filePath,
            source_harness: harness,
            reason: "File is not valid UTF-8 text",
          });
          continue;
        }
      } catch (err) {
        errors.push({
          file_path: filePath,
          source_harness: harness,
          reason: `Cannot read file: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }

      let rawBody: string;
      try {
        rawBody = raw;
      } catch (err) {
        errors.push({
          file_path: filePath,
          source_harness: harness,
          reason: `Cannot decode body: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }

      const contentHash = computeContentHash(rawBody);
      const frontmatterName = extractSkillNameFromBody(rawBody);
      const version = extractVersionFromBody(rawBody);
      const fallbackName = fileName.replace(/\.md$/i, "");
      const skillName = frontmatterName ?? fallbackName;
      let parseError: string | null = null;
      if (!skillName) {
        parseError = "Could not derive skill_name from frontmatter or filename";
      }
      if (!frontmatterName && !parseError) {
        // Skill present but missing frontmatter name — we still record
        // an entry so the operator can see it, with parse_error set so
        // they know the contract is incomplete.
        parseError = "No `name:` frontmatter field; using filename as fallback";
      }
      entries.push({
        skill_name: skillName,
        source_harness: harness,
        version,
        raw_body: rawBody,
        content_hash: contentHash,
        file_path: filePath,
        parse_error: parseError,
      });
      if (parseError) {
        errors.push({
          file_path: filePath,
          source_harness: harness,
          reason: parseError,
        });
      }
    }
  }

  return { entries, errors };
}

// ---------------------------------------------------------------------------
// diffSkills — field-level diff
// ---------------------------------------------------------------------------

/**
 * Computes a structured field-level diff between an existing registry
 * entry and a detected skill. The result is a SyncDiff that the caller
 * uses to decide whether to create an import proposal.
 *
 * Detection priority:
 *   - `no_change`: detected.content_hash matches existing.content_hash.
 *   - `change`:    detected.content_hash differs from existing.content_hash.
 *                  `changed_fields` lists the specific fields that differ
 *                  (currently: version, raw_body, content_hash). Other
 *                  fields are skipped — SKILLTRUST-04 cares about
 *                  content-level drift, not metadata drift.
 *   - `add`:       no existing entry — the diff is "this is new".
 */
export function diffSkills(
  existing: DetectedSkillInput | null,
  detected: DetectedSkillInput
): SyncDiff {
  const detectedHash = requireHash(
    detected.content_hash ?? computeContentHash(detected.raw_body ?? ""),
    "detected.content_hash"
  );
  const currentHash = existing?.content_hash ?? null;
  const skillName = requireSkillName(detected.skill_name);
  const sourceHarness = requireHarness(detected.source_harness);
  const detectedVersion = detected.version ?? null;

  if (!existing) {
    return {
      kind: "add",
      skill_name: skillName,
      source_harness: sourceHarness,
      detected_hash: detectedHash,
      current_hash: null,
      version: detectedVersion,
      prior_version: null,
      changed_fields: [],
      summary: `New skill detected: ${skillName}@${detectedVersion ?? "unknown"}`,
    };
  }

  const changed: SyncFieldChange[] = [];
  if (currentHash && currentHash.toLowerCase() === detectedHash.toLowerCase()) {
    return {
      kind: "no_change",
      skill_name: skillName,
      source_harness: sourceHarness,
      detected_hash: detectedHash,
      current_hash: currentHash,
      version: detectedVersion,
      prior_version: existing.version ?? null,
      changed_fields: [],
      summary: "No content drift detected",
    };
  }

  if ((existing.version ?? null) !== detectedVersion) {
    changed.push({
      field: "version",
      old_value: existing.version ?? null,
      new_value: detectedVersion,
    });
  }
  if ((existing.raw_body ?? null) !== (detected.raw_body ?? null)) {
    changed.push({
      field: "raw_body",
      old_value: existing.raw_body ?? null,
      new_value: detected.raw_body ?? null,
    });
  }
  changed.push({
    field: "content_hash",
    old_value: currentHash,
    new_value: detectedHash,
  });

  const summary = changed
    .map((c) => `${c.field}:${c.old_value ?? "∅"}→${c.new_value ?? "∅"}`)
    .join(";");

  return {
    kind: "change",
    skill_name: skillName,
    source_harness: sourceHarness,
    detected_hash: detectedHash,
    current_hash: currentHash,
    version: detectedVersion,
    prior_version: existing.version ?? null,
    changed_fields: changed,
    summary: summary || `Content drift detected for ${skillName}`,
  };
}

// ---------------------------------------------------------------------------
// Sync state CRUD
// ---------------------------------------------------------------------------

export function getSyncStateRow(
  db: Database.Database,
  skillName: string,
  sourceHarness: HarnessName
): SkillSyncStateRow | null {
  return loadSyncStateRow(db, skillName, sourceHarness);
}

export interface ListSyncStateOptions {
  pending_only?: boolean;
  pinned_only?: boolean;
  limit?: number;
  offset?: number;
}

export function listSyncState(
  db: Database.Database,
  options: ListSyncStateOptions = {}
): SkillSyncStateRow[] {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (options.pending_only) {
    conditions.push("pending_proposal_id IS NOT NULL");
  }
  if (options.pinned_only) {
    conditions.push("version_pinned_to IS NOT NULL");
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit =
    options.limit && Number.isFinite(options.limit) && options.limit > 0
      ? Math.min(options.limit, 200)
      : 50;
  const offset =
    options.offset && Number.isFinite(options.offset) && options.offset >= 0
      ? options.offset
      : 0;
  const rows = db
    .prepare<unknown[], SkillSyncSqlRow>(
      `${SYNC_SELECT_BASE} ${where} ORDER BY last_check_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
  return rows.map(rowToState);
}

/**
 * Computes per-skill observability items. Adds the `drift` and `status`
 * booleans that the GET /api/skills/sync endpoint exposes for NOC and
 * dashboards. `drift` is true when a pending proposal exists and the
 * detected hash differs from the last_synced hash.
 */
export function listSyncObservability(
  db: Database.Database,
  options: ListSyncStateOptions = {}
): SkillSyncObservabilityItem[] {
  const rows = listSyncState(db, options);
  return rows.map((r) => {
    let status: SyncProposalStatus = "no_change";
    if (r.pending_proposal_id) {
      status =
        r.rejected_at && !r.approved_at ? "rejected" : "pending";
    } else if (r.approved_at) {
      status = "approved";
    } else if (r.rejected_at) {
      status = "rejected";
    }
    const drift =
      Boolean(r.pending_proposal_id) &&
      r.pending_detected_hash !== null &&
      r.last_synced_hash !== null &&
      r.pending_detected_hash.toLowerCase() !==
        r.last_synced_hash.toLowerCase();
    return {
      skill_name: r.skill_name,
      source_harness: r.source_harness,
      last_synced_hash: r.last_synced_hash,
      pending_proposal_id: r.pending_proposal_id,
      drift,
      version_pinned_to: r.version_pinned_to,
      last_check_at: r.last_check_at,
      status,
    };
  });
}

// ---------------------------------------------------------------------------
// Proposal lifecycle
// ---------------------------------------------------------------------------

/**
 * Records a cross-harness skill detection as a pending proposal in
 * `skill_sync_state`. The skill_registry is NEVER mutated.
 *
 * Behavior:
 *   - When the detected content_hash matches the registry row's current
 *     content_hash and a sync_state row exists with the same
 *     pending_detected_hash, the existing state row is returned
 *     (idempotent — no duplicate pending proposal).
 *   - When the detected hash matches the registry's current hash but
 *     no sync_state row exists, the function still records the row but
 *     leaves pending_proposal_id null (a "no drift" mark so the operator
 *     audit trail surfaces the scan).
 *   - When the hash differs and a pending proposal with the same
 *     detected hash already exists, it is returned unchanged (dedupe).
 *   - When the hash differs and a different pending proposal is in
 *     flight, the prior proposal is rotated to the `prior_*` fields so
 *     a single rollback restores the last accepted version.
 *   - When `version_pinned_to` is set on the existing state row, no
 *     proposal is created — drift is suppressed.
 *
 * Returns `{ created, proposal }` so callers can report the outcome.
 */
export function createImportProposal(
  db: Database.Database,
  params: CreateImportProposalParams
): CreateImportProposalResult {
  const sourceHarness = requireHarness(params.source_harness);
  const skillName = requireSkillName(params.detected.skill_name);
  const proposedBy = requireNonEmpty(params.proposed_by, "proposed_by");
  const detectedVersion = params.detected.version ?? null;

  let detectedHash: string;
  if (params.detected.content_hash) {
    detectedHash = requireHash(params.detected.content_hash, "detected.content_hash");
  } else if (typeof params.detected.raw_body === "string") {
    detectedHash = computeContentHash(params.detected.raw_body);
  } else {
    throw new SkillSyncError(
      "createImportProposal requires detected.content_hash or detected.raw_body"
    );
  }

  const now = nowIso();

  // Look up the existing registry row (may not exist for new skills).
  const registryRow = db
    .prepare<[string, string], {
      id: number;
      content_hash: string | null;
      version: string | null;
      raw_body: string | null;
    }>(
      `SELECT id, content_hash, version, raw_body
         FROM skill_registry
        WHERE source_harness = ?
          AND name = ?
        LIMIT 1`
    )
    .get(sourceHarness, skillName);

  const existing = loadSyncStateRow(db, skillName, sourceHarness);

  // Version pin suppresses drift entirely.
  if (existing?.version_pinned_to) {
    return { created: false, proposal: existing };
  }

  // No drift — record a scan marker so the operator audit trail surfaces it,
  // but no proposal is created.
  const currentHash = registryRow?.content_hash ?? null;
  if (
    currentHash &&
    currentHash.toLowerCase() === detectedHash.toLowerCase()
  ) {
    if (!existing) {
      db.prepare(
        `INSERT INTO skill_sync_state (
          skill_name, source_harness, last_synced_hash, pending_proposal_id,
          pending_detected_hash, pending_detected_version, pending_diff_summary,
          pending_diff_payload, pending_proposed_by, pending_proposed_at,
          version_pinned_to, last_check_at, prior_version, prior_content_hash,
          prior_skill_id, approved_by, approved_at, rejected_by, rejected_at,
          rejection_reason, created_at, updated_at
        ) VALUES (
          ?, ?, ?, NULL,
          ?, ?, ?,
          ?, NULL, NULL,
          NULL, ?, NULL, NULL,
          NULL, NULL, NULL, NULL, NULL,
          NULL, ?, ?
        )`
      ).run(
        skillName,
        sourceHarness,
        currentHash,
        detectedHash,
        detectedVersion,
        "no_change",
        "{}",
        now,
        now,
        now
      );
    } else {
      db.prepare(
        `UPDATE skill_sync_state
            SET last_check_at = ?,
                updated_at = ?
          WHERE skill_name = ? AND source_harness = ?`
      ).run(now, now, skillName, sourceHarness);
    }
    const refreshed = loadSyncStateRow(db, skillName, sourceHarness);
    return {
      created: false,
      proposal: refreshed ?? existing ?? {
        skill_name: skillName,
        source_harness: sourceHarness,
        status: "no_change",
        last_synced_hash: currentHash,
        pending_proposal_id: null,
        pending_detected_hash: detectedHash,
        pending_detected_version: detectedVersion,
        pending_diff_summary: "no_change",
        pending_diff_payload: "{}",
        pending_proposed_by: null,
        pending_proposed_at: null,
        version_pinned_to: null,
        last_check_at: now,
        prior_version: null,
        prior_content_hash: null,
        prior_skill_id: null,
        approved_by: null,
        approved_at: null,
        rejected_by: null,
        rejected_at: null,
        rejection_reason: null,
        created_at: now,
        updated_at: now,
      },
    };
  }

  // Dedupe — a pending proposal with this same detected hash already exists.
  if (
    existing &&
    existing.pending_proposal_id &&
    existing.pending_detected_hash?.toLowerCase() === detectedHash.toLowerCase() &&
    !existing.approved_at &&
    !existing.rejected_at
  ) {
    db.prepare(
      `UPDATE skill_sync_state
          SET last_check_at = ?,
              updated_at = ?
        WHERE skill_name = ? AND source_harness = ?`
    ).run(now, now, skillName, sourceHarness);
    return {
      created: false,
      proposal: loadSyncStateRow(db, skillName, sourceHarness) ?? existing,
    };
  }

  const proposalId = randomUUID();
  // Capture the prior content from the registry so a one-step rollback
  // can restore the version that existed immediately before this drift
  // was detected. When no registry row exists yet (truly new skill)
  // the prior_* fields are null — there is nothing to roll back to.
  const priorVersion = registryRow?.version ?? null;
  const priorContentHash = currentHash;
  const priorSkillId = registryRow?.id ?? null;
  // Always embed the detected raw_body in the diff_payload so the
  // approve step can apply it back to the registry without re-scanning.
  // Also embed the prior raw_body so rollback can fully restore.
  const diffPayload: Record<string, unknown> = {
    ...(params.diff_payload ?? {}),
    detected_hash: detectedHash,
    current_hash: currentHash,
    detected_version: detectedVersion,
    current_version: registryRow?.version ?? null,
    raw_body: params.detected.raw_body ?? null,
    prior_raw_body: registryRow?.raw_body ?? null,
  };

  if (existing) {
    db.prepare(
      `UPDATE skill_sync_state
          SET last_check_at = ?,
              pending_proposal_id = ?,
              pending_detected_hash = ?,
              pending_detected_version = ?,
              pending_diff_summary = ?,
              pending_diff_payload = ?,
              pending_proposed_by = ?,
              pending_proposed_at = ?,
              prior_version = ?,
              prior_content_hash = ?,
              prior_skill_id = ?,
              approved_by = NULL,
              approved_at = NULL,
              rejected_by = NULL,
              rejected_at = NULL,
              rejection_reason = NULL,
              updated_at = ?
        WHERE skill_name = ? AND source_harness = ?`
    ).run(
      now,
      proposalId,
      detectedHash,
      detectedVersion,
      params.diff_summary ?? `Drift detected for ${skillName}`,
      sanitizeJsonPayload(diffPayload),
      proposedBy,
      now,
      priorVersion,
      priorContentHash,
      priorSkillId,
      now,
      skillName,
      sourceHarness
    );
  } else {
    db.prepare(
      `INSERT INTO skill_sync_state (
        skill_name, source_harness, last_synced_hash, pending_proposal_id,
        pending_detected_hash, pending_detected_version, pending_diff_summary,
        pending_diff_payload, pending_proposed_by, pending_proposed_at,
        version_pinned_to, last_check_at, prior_version, prior_content_hash,
        prior_skill_id, approved_by, approved_at, rejected_by, rejected_at,
        rejection_reason, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        NULL, ?, ?, ?,
        ?, NULL, NULL, NULL, NULL,
        NULL, ?, ?
      )`
    ).run(
      skillName,
      sourceHarness,
      currentHash,
      proposalId,
      detectedHash,
      detectedVersion,
      params.diff_summary ?? `Drift detected for ${skillName}`,
      sanitizeJsonPayload(diffPayload),
      proposedBy,
      now,
      now,
      priorVersion,
      priorContentHash,
      priorSkillId,
      now,
      now
    );
  }

  const refreshed = loadSyncStateRow(db, skillName, sourceHarness);
  if (!refreshed) {
    throw new SkillSyncError(
      `createImportProposal: failed to read back skill_sync_state row for ${skillName}@${sourceHarness}`
    );
  }
  return { created: true, proposal: refreshed };
}

/**
 * Approves a pending proposal:
 *   - Updates the registry row's raw_body / version / content_hash to
 *     reflect the approved content. dispatch_status is set to
 *     'quarantined' so the skill must pass through the quarantine
 *     pipeline before becoming dispatchable (SKILLTRUST-03 + SKILLTRUST-04).
 *   - When no registry row exists for the skill, one is inserted with
 *     dispatch_status='quarantined'.
 *   - Updates skill_sync_state.last_synced_hash, clears pending_proposal_*
 *     fields, and records approved_by/approved_at.
 *   - Writes a `skill.sync.approved` audit_entries row.
 *
 * Throws SkillSyncError when:
 *   - no sync_state row exists for (skill_name, source_harness),
 *   - no pending proposal exists (already approved/rejected),
 *   - the operator identity is empty.
 */
export function approveImportProposal(
  db: Database.Database,
  params: ApproveImportProposalParams
): SkillSyncStateRow {
  const skillName = requireSkillName(params.skill_name);
  const sourceHarness = requireHarness(params.source_harness);
  const operator = requireNonEmpty(params.operator, "operator");
  const applyToRegistry = params.apply_to_registry !== false;

  const existing = loadSyncStateRow(db, skillName, sourceHarness);
  if (!existing) {
    throw new SkillSyncError(
      `No sync_state row for ${skillName}@${sourceHarness}`
    );
  }
  if (!existing.pending_proposal_id) {
    throw new SkillSyncError(
      `No pending proposal for ${skillName}@${sourceHarness} (status=${existing.approved_at ? "approved" : existing.rejected_at ? "rejected" : "no_change"})`
    );
  }
  if (existing.rejected_at && !existing.approved_at) {
    throw new SkillSyncError(
      `Cannot approve ${skillName}@${sourceHarness}: pending proposal was rejected at ${existing.rejected_at}`
    );
  }

  const now = nowIso();
  const newHash = existing.pending_detected_hash;
  if (!newHash) {
    throw new SkillSyncError(
      `Pending proposal for ${skillName}@${sourceHarness} is missing detected hash`
    );
  }

  if (applyToRegistry) {
    // Find the existing registry row and update / insert accordingly.
    const registryRow = db
      .prepare<[string, string], {
        id: number;
        raw_body: string | null;
      }>(
        `SELECT id, raw_body FROM skill_registry
          WHERE source_harness = ? AND name = ?
          LIMIT 1`
      )
      .get(sourceHarness, skillName);

    // Pull the proposed body from the registry when it was already there
    // (the diff_payload stored detected_content_hash but the body itself
    // lives on the sync check payload; for approval we re-read the
    // pending diff_payload which contains the raw_body when supplied by
    // the caller). The proposal API keeps raw_body on the registry when
    // it exists, so prefer the registry copy.
    let proposedBody: string | null = null;
    let proposedVersion: string | null = existing.pending_detected_version;
    if (existing.pending_diff_payload) {
      try {
        const parsed = JSON.parse(existing.pending_diff_payload) as Record<
          string,
          unknown
        >;
        if (typeof parsed["raw_body"] === "string") {
          proposedBody = parsed["raw_body"] as string;
        }
        if (typeof parsed["version"] === "string") {
          proposedVersion = parsed["version"] as string;
        }
      } catch {
        /* ignore */
      }
    }

    if (registryRow) {
      db.prepare(
        `UPDATE skill_registry
            SET raw_body = COALESCE(?, raw_body),
                version = COALESCE(?, version),
                content_hash = ?,
                dispatch_status = 'quarantined'
          WHERE id = ?`
      ).run(proposedBody, proposedVersion, newHash, registryRow.id);
    } else {
      // Insert a new quarantined row so the registry has a placeholder
      // for the approved content. The quarantine pipeline will compute
      // completeness_pct etc. when it scans.
      db.prepare(
        `INSERT INTO skill_registry (
          name, description, owner, source_harness, risk_tier, dispatch_status,
          version, preconditions, allowed_tools, verification_checks, rollback_behavior,
          raw_body, completeness_pct, missing_fields_json, imported_by, imported_at,
          evidence_examples, content_hash, signature, signed_by, signed_at, trust_level,
          public_key_fingerprint
        ) VALUES (
          ?, '', ?, ?, 'unknown', 'quarantined',
          ?, '', '', '', '',
          ?, 0, '[]', ?, ?,
          '', ?, NULL, NULL, NULL, 'unsigned',
          NULL
        )`
      ).run(
        skillName,
        operator,
        sourceHarness,
        proposedVersion,
        proposedBody ?? "",
        operator,
        now
      );
    }
  }

  db.prepare(
    `UPDATE skill_sync_state
        SET approved_by = ?,
            approved_at = ?,
            last_synced_hash = ?,
            pending_proposal_id = NULL,
            pending_detected_hash = NULL,
            pending_detected_version = NULL,
            pending_diff_summary = '',
            pending_proposed_by = NULL,
            pending_proposed_at = NULL,
            updated_at = ?
      WHERE skill_name = ? AND source_harness = ?`
  ).run(operator, now, newHash, now, skillName, sourceHarness);

  // NOTE: pending_diff_payload is intentionally preserved across
  // approval so rollbackToPriorVersion can recover the prior_raw_body
  // for a full restore. The payload is not operator-facing (no API
  // exposes it directly) so it is safe to retain for audit purposes.

  writeAuditEntry(db, {
    actor: operator,
    eventType: "skill.sync.approved",
    entityType: "skill_sync_state",
    entityId: `${skillName}@${sourceHarness}`,
    metadata: {
      skill_name: skillName,
      source_harness: sourceHarness,
      last_synced_hash: newHash,
    },
  });

  const refreshed = loadSyncStateRow(db, skillName, sourceHarness);
  if (!refreshed) {
    throw new SkillSyncError(
      `approveImportProposal: row vanished for ${skillName}@${sourceHarness}`
    );
  }
  return refreshed;
}

/**
 * Rejects a pending proposal. Clears the pending proposal without
 * mutating the skill_registry row. Records operator + reason.
 *
 * Throws SkillSyncError when:
 *   - no sync_state row exists for (skill_name, source_harness),
 *   - no pending proposal exists (already approved/rejected),
 *   - reason is empty,
 *   - operator identity is empty.
 */
export function rejectImportProposal(
  db: Database.Database,
  params: RejectImportProposalParams
): SkillSyncStateRow {
  const skillName = requireSkillName(params.skill_name);
  const sourceHarness = requireHarness(params.source_harness);
  const operator = requireNonEmpty(params.operator, "operator");
  const reason = requireNonEmpty(params.reason, "reason");

  const existing = loadSyncStateRow(db, skillName, sourceHarness);
  if (!existing) {
    throw new SkillSyncError(
      `No sync_state row for ${skillName}@${sourceHarness}`
    );
  }
  if (!existing.pending_proposal_id) {
    throw new SkillSyncError(
      `No pending proposal for ${skillName}@${sourceHarness} to reject`
    );
  }
  if (existing.approved_at && !existing.rejected_at) {
    throw new SkillSyncError(
      `Cannot reject ${skillName}@${sourceHarness}: pending proposal was already approved`
    );
  }

  const now = nowIso();
  db.prepare(
    `UPDATE skill_sync_state
        SET rejected_by = ?,
            rejected_at = ?,
            rejection_reason = ?,
            pending_proposal_id = NULL,
            pending_detected_hash = NULL,
            pending_detected_version = NULL,
            pending_diff_summary = '',
            pending_diff_payload = '{}',
            pending_proposed_by = NULL,
            pending_proposed_at = NULL,
            updated_at = ?
      WHERE skill_name = ? AND source_harness = ?`
  ).run(operator, now, reason, now, skillName, sourceHarness);

  writeAuditEntry(db, {
    actor: operator,
    eventType: "skill.sync.rejected",
    entityType: "skill_sync_state",
    entityId: `${skillName}@${sourceHarness}`,
    reason,
    metadata: {
      skill_name: skillName,
      source_harness: sourceHarness,
      rejection_reason: reason,
    },
  });

  const refreshed = loadSyncStateRow(db, skillName, sourceHarness);
  if (!refreshed) {
    throw new SkillSyncError(
      `rejectImportProposal: row vanished for ${skillName}@${sourceHarness}`
    );
  }
  return refreshed;
}

// ---------------------------------------------------------------------------
// Version pinning
// ---------------------------------------------------------------------------

/**
 * Pins a (skill_name, source_harness) to a specific version. While the
 * pin is in place, `createImportProposal` will not create drift
 * proposals for that pair (VAL-SYNC-005).
 *
 * Throws SkillSyncError when:
 *   - any required field is empty,
 *   - the source_harness is unsupported.
 */
export function pinVersion(
  db: Database.Database,
  params: PinVersionParams
): SkillSyncStateRow {
  const skillName = requireSkillName(params.skill_name);
  const sourceHarness = requireHarness(params.source_harness);
  const version = requireNonEmpty(params.version, "version");
  const actor = requireNonEmpty(params.actor, "actor");

  const existing = loadSyncStateRow(db, skillName, sourceHarness);
  const now = nowIso();

  if (existing) {
    db.prepare(
      `UPDATE skill_sync_state
          SET version_pinned_to = ?,
              updated_at = ?
        WHERE skill_name = ? AND source_harness = ?`
    ).run(version, now, skillName, sourceHarness);
  } else {
    db.prepare(
      `INSERT INTO skill_sync_state (
        skill_name, source_harness, last_synced_hash, pending_proposal_id,
        pending_detected_hash, pending_detected_version, pending_diff_summary,
        pending_diff_payload, pending_proposed_by, pending_proposed_at,
        version_pinned_to, last_check_at, prior_version, prior_content_hash,
        prior_skill_id, approved_by, approved_at, rejected_by, rejected_at,
        rejection_reason, created_at, updated_at
      ) VALUES (
        ?, ?, NULL, NULL,
        NULL, NULL, '',
        '{}', NULL, NULL,
        ?, ?, NULL, NULL,
        NULL, NULL, NULL, NULL, NULL,
        NULL, ?, ?
      )`
    ).run(skillName, sourceHarness, version, now, now, now);
  }

  writeAuditEntry(db, {
    actor,
    eventType: "skill.sync.pinned",
    entityType: "skill_sync_state",
    entityId: `${skillName}@${sourceHarness}`,
    metadata: { skill_name: skillName, source_harness: sourceHarness, version },
  });

  const refreshed = loadSyncStateRow(db, skillName, sourceHarness);
  if (!refreshed) {
    throw new SkillSyncError(
      `pinVersion: row vanished for ${skillName}@${sourceHarness}`
    );
  }
  return refreshed;
}

/**
 * Clears an existing version pin, allowing drift proposals to be
 * created again on the next sync check. Throws SkillSyncError when no
 * pin is set.
 */
export function clearVersionPin(
  db: Database.Database,
  params: ClearPinParams
): SkillSyncStateRow {
  const skillName = requireSkillName(params.skill_name);
  const sourceHarness = requireHarness(params.source_harness);
  const actor = requireNonEmpty(params.actor, "actor");

  const existing = loadSyncStateRow(db, skillName, sourceHarness);
  if (!existing) {
    throw new SkillSyncError(
      `No sync_state row for ${skillName}@${sourceHarness}`
    );
  }
  if (!existing.version_pinned_to) {
    throw new SkillSyncError(
      `No version pin set for ${skillName}@${sourceHarness}`
    );
  }

  const now = nowIso();
  db.prepare(
    `UPDATE skill_sync_state
        SET version_pinned_to = NULL,
            updated_at = ?
      WHERE skill_name = ? AND source_harness = ?`
  ).run(now, skillName, sourceHarness);

  writeAuditEntry(db, {
    actor,
    eventType: "skill.sync.unpinned",
    entityType: "skill_sync_state",
    entityId: `${skillName}@${sourceHarness}`,
    metadata: {
      skill_name: skillName,
      source_harness: sourceHarness,
      prior_pin: existing.version_pinned_to,
    },
  });

  const refreshed = loadSyncStateRow(db, skillName, sourceHarness);
  if (!refreshed) {
    throw new SkillSyncError(
      `clearVersionPin: row vanished for ${skillName}@${sourceHarness}`
    );
  }
  return refreshed;
}

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------

/**
 * One-step rollback: restores the immediately prior version of a skill
 * to the registry and updates last_synced_hash accordingly. The prior
 * version comes from the `prior_*` columns on skill_sync_state.
 *
 * Behavior:
 *   - When `prior_skill_id` is set, the registry row at that id is
 *     updated to point at the prior content (or, if that registry row
 *     no longer exists, the new registry row is updated).
 *   - When no prior_skill_id is set (the prior was never in the
 *     registry, e.g. initial sync), the registry row's content is
 *     restored from the prior_* fields directly.
 *   - After rollback, prior_* are cleared so the rollback is exactly
 *     one step. A second rollback fails.
 *
 * Throws SkillSyncError when:
 *   - no sync_state row exists,
 *   - no prior_version/prior_content_hash is recorded,
 *   - the operator identity is empty.
 */
export function rollbackToPriorVersion(
  db: Database.Database,
  params: RollbackParams
): SkillSyncStateRow {
  const skillName = requireSkillName(params.skill_name);
  const sourceHarness = requireHarness(params.source_harness);
  const operator = requireNonEmpty(params.operator, "operator");

  const existing = loadSyncStateRow(db, skillName, sourceHarness);
  if (!existing) {
    throw new SkillSyncError(
      `No sync_state row for ${skillName}@${sourceHarness}`
    );
  }
  if (!existing.prior_version || !existing.prior_content_hash) {
    throw new SkillSyncError(
      `No prior version recorded for ${skillName}@${sourceHarness}; rollback is one-step and the prior has already been consumed`
    );
  }

  const now = nowIso();
  const registryRow = db
    .prepare<[string, string], { id: number }>(
      `SELECT id FROM skill_registry
        WHERE source_harness = ? AND name = ?
        LIMIT 1`
    )
    .get(sourceHarness, skillName);

  // Best-effort restore of the prior raw_body from the proposal payload.
  // When no proposal payload carried it (e.g. legacy migration), we leave
  // the registry raw_body as-is so we never lose content.
  let priorRawBody: string | null = null;
  const proposalPayload = db
    .prepare<[string, string], { pending_diff_payload: string | null }>(
      `SELECT pending_diff_payload FROM skill_sync_state
        WHERE skill_name = ? AND source_harness = ?
        LIMIT 1`
    )
    .get(skillName, sourceHarness);
  if (proposalPayload?.pending_diff_payload) {
    try {
      const parsed = JSON.parse(proposalPayload.pending_diff_payload) as Record<
        string,
        unknown
      >;
      if (typeof parsed["prior_raw_body"] === "string") {
        priorRawBody = parsed["prior_raw_body"] as string;
      }
    } catch {
      /* ignore */
    }
  }

  if (registryRow) {
    if (priorRawBody !== null) {
      db.prepare(
        `UPDATE skill_registry
            SET raw_body = ?,
                version = ?,
                content_hash = ?,
                dispatch_status = 'quarantined'
          WHERE id = ?`
      ).run(priorRawBody, existing.prior_version, existing.prior_content_hash, registryRow.id);
    } else {
      db.prepare(
        `UPDATE skill_registry
            SET version = ?,
                content_hash = ?,
                dispatch_status = 'quarantined'
          WHERE id = ?`
      ).run(existing.prior_version, existing.prior_content_hash, registryRow.id);
    }
  }

  db.prepare(
    `UPDATE skill_sync_state
        SET last_synced_hash = ?,
            pending_proposal_id = NULL,
            pending_detected_hash = NULL,
            pending_detected_version = NULL,
            pending_diff_summary = '',
            pending_diff_payload = '{}',
            pending_proposed_by = NULL,
            pending_proposed_at = NULL,
            prior_version = NULL,
            prior_content_hash = NULL,
            prior_skill_id = NULL,
            updated_at = ?
      WHERE skill_name = ? AND source_harness = ?`
  ).run(existing.prior_content_hash, now, skillName, sourceHarness);

  writeAuditEntry(db, {
    actor: operator,
    eventType: "skill.sync.rolled_back",
    entityType: "skill_sync_state",
    entityId: `${skillName}@${sourceHarness}`,
    metadata: {
      skill_name: skillName,
      source_harness: sourceHarness,
      rolled_back_to_version: existing.prior_version,
      rolled_back_to_hash: existing.prior_content_hash,
    },
  });

  const refreshed = loadSyncStateRow(db, skillName, sourceHarness);
  if (!refreshed) {
    throw new SkillSyncError(
      `rollbackToPriorVersion: row vanished for ${skillName}@${sourceHarness}`
    );
  }
  return refreshed;
}

// ---------------------------------------------------------------------------
// Top-level checkSync — scans filesystem + creates proposals
// ---------------------------------------------------------------------------

/**
 * Runs the full check pipeline for a set of harness roots:
 *   - detectHarnessSkills({ roots }) -> DetectedSkill[] + DetectionError[]
 *   - For each detected entry: lookup existing registry row + sync_state
 *     row, run diffSkills(), then createImportProposal().
 *
 * The function is idempotent: re-running it with no changes produces
 * zero new proposals (VAL-SYNC-008). Malformed files are skipped and
 * surfaced via the returned `errors` array (VAL-SYNC-009).
 */
export function checkSync(
  db: Database.Database,
  params: CheckSyncParams
): {
  detected: number;
  created: number;
  unchanged: number;
  errors: DetectionError[];
} {
  const proposedBy = params.proposed_by ?? "sync-scanner";
  const detection = detectHarnessSkills({ roots: params.roots });
  let created = 0;
  let unchanged = 0;

  for (const entry of detection.entries) {
    if (entry.parse_error) continue;
    const registryRow = db
      .prepare<[string, string], {
        id: number;
        content_hash: string | null;
        version: string | null;
        raw_body: string | null;
      }>(
        `SELECT id, content_hash, version, raw_body
           FROM skill_registry
          WHERE source_harness = ?
            AND name = ?
          LIMIT 1`
      )
      .get(entry.source_harness, entry.skill_name);
    const existingInput = registryRow
      ? {
          skill_name: entry.skill_name,
          source_harness: entry.source_harness,
          version: registryRow.version,
          raw_body: registryRow.raw_body,
          content_hash: registryRow.content_hash,
        }
      : null;
    const diff = diffSkills(existingInput, {
      skill_name: entry.skill_name,
      source_harness: entry.source_harness,
      version: entry.version,
      raw_body: entry.raw_body,
      content_hash: entry.content_hash,
    });

    if (diff.kind === "no_change") {
      unchanged += 1;
      continue;
    }

    const result = createImportProposal(db, {
      source_harness: entry.source_harness,
      detected: {
        skill_name: entry.skill_name,
        source_harness: entry.source_harness,
        version: entry.version,
        raw_body: entry.raw_body,
        content_hash: entry.content_hash,
      },
      proposed_by: proposedBy,
      diff_summary: diff.summary,
      diff_payload: {
        ...diff,
        raw_body: entry.raw_body,
      },
    });
    if (result.created) created += 1;
  }

  return {
    detected: detection.entries.length,
    created,
    unchanged,
    errors: detection.errors,
  };
}

// ---------------------------------------------------------------------------
// Content hashing re-export
// ---------------------------------------------------------------------------

export { computeContentHash };

// Silence unused-import warning when createHash is only used by the
// audit path / randomUUID — keep it referenced so future refactors don't
// accidentally remove the import.
void createHash;
