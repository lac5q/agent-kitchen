import { createHash } from "crypto";
import type Database from "better-sqlite3";

import manifest from "@/lib/gsd/skill-boundary-manifest.json";
import { persistProposals } from "@/lib/skillforge/proposal";
import type { SkillForgeProposal } from "@/lib/skillforge/types";

export type SkillBoundaryClassification =
  | "core_product"
  | "portable_skill"
  | "adapter_skill"
  | "reference_only"
  | "defer";

export interface SkillBoundaryEntry {
  id: string;
  name: string;
  classification: SkillBoundaryClassification;
  owner: string;
  rationale: string;
}

export interface SkillBoundaryManifest {
  version: string;
  updatedAt: string;
  rule: string;
  coreProductBarredFromSkillsOnly: string[];
  entries: SkillBoundaryEntry[];
}

export type SkillAuditFindingCode =
  | "missing_owner"
  | "missing_smoke_test"
  | "stale_review_date"
  | "duplicate_trigger"
  | "unsafe_tool_instructions"
  | "no_examples"
  | "no_usage_evidence";

export interface SkillAuditFinding {
  skillId: string;
  skillName: string;
  sourceHarness: string;
  code: SkillAuditFindingCode;
  severity: "high" | "medium" | "low";
  summary: string;
  evidence?: string;
}

export interface SkillAuditProposalDraft {
  proposalId: string;
  skillId: string;
  skillName: string;
  sourceHarness: string;
  status: "pending_approval";
  summary: string;
  findings: SkillAuditFindingCode[];
}

export interface SkillAuditResult {
  auditedAt: string;
  manifestVersion: string;
  skillsScanned: number;
  findings: SkillAuditFinding[];
  proposalDrafts: SkillAuditProposalDraft[];
  persistedProposalIds: string[];
}

type SkillRow = {
  id: number;
  name: string;
  owner: string | null;
  source_harness: string;
  verification_checks: string | null;
  imported_at: string;
  raw_body: string;
  dispatch_status: string;
};

const UNSAFE_TOOL_PATTERNS: Array<{ code: SkillAuditFindingCode; pattern: RegExp; summary: string }> = [
  {
    code: "unsafe_tool_instructions",
    pattern: /\b(rm\s+-rf|curl\s+.*\|\s*(ba)?sh|eval\s*\(|exec\s*\(|process\.env|sudo\s+)/i,
    summary: "Skill body contains potentially unsafe shell or execution instructions.",
  },
];

const STALE_REVIEW_DAYS = 90;
const EXAMPLE_MARKERS = [/\bexample\b/i, /```/, /^##\s+usage/im];

export function loadSkillBoundaryManifest(): SkillBoundaryManifest {
  return manifest as SkillBoundaryManifest;
}

function daysSince(iso: string, now: Date): number {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - then) / (1000 * 60 * 60 * 24);
}

function hasExamples(body: string): boolean {
  return EXAMPLE_MARKERS.some((pattern) => pattern.test(body));
}

function hasUsageEvidence(db: Database.Database, skillName: string, sourceHarness: string): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM hive_actions
       WHERE summary LIKE @needle OR artifacts LIKE @needle`
    )
    .get({ needle: `%${skillName}%` }) as { count?: number };
  if ((row.count ?? 0) > 0) return true;

  const dispatchRow = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM skill_registry
       WHERE name = @name AND source_harness = @sourceHarness AND dispatch_status = 'enabled'`
    )
    .get({ name: skillName, sourceHarness }) as { count?: number };
  return (dispatchRow.count ?? 0) > 0 && sourceHarness !== "unknown";
}

function draftProposalFromFindings(
  row: SkillRow,
  findings: SkillAuditFinding[],
  now: Date
): SkillForgeProposal {
  const findingsList = findings.map((finding) => `- ${finding.code}: ${finding.summary}`).join("\n");
  const proposedDiff = `--- SKILL.md (${row.name})
+++ SKILL.md (skill-audit proposal)
@@ skill audit ${row.name}
+## Skill Audit Findings (${now.toISOString()})
+${findingsList || "- No findings"}
+
+## Operator Action
+Review findings and apply bounded SkillForge edits. Auto-delete is disabled.
`;
  const id = `sf-audit-${row.id}-${createHash("sha256").update(`${row.name}:${row.source_harness}`).digest("hex").slice(0, 8)}`;
  return {
    id,
    sealProposalId: null,
    sourceSkillId: String(row.id),
    sourceVersion: row.source_harness,
    proposedDiff,
    status: "pending_approval",
    editHash: createHash("sha256").update(proposedDiff).digest("hex").slice(0, 16),
    trainSplitId: null,
    validationSplitId: null,
    heldOutSplitId: null,
    baselineW: null,
    validationW: null,
    heldOutW: null,
    validationResults: null,
    heldOutResults: null,
    wDelta: null,
    evaluatorReceipts: findings.map((finding) => ({
      evaluator: "skill-audit",
      code: finding.code,
      summary: finding.summary,
    })),
    typedEditOps: [],
    rejectedEdits: [],
    residualRisks: findings.filter((finding) => finding.severity === "high").map((finding) => finding.summary),
    createdAt: now,
    updatedAt: now,
  };
}

export function auditRegisteredSkills(
  db: Database.Database,
  input: { persistProposals?: boolean; now?: () => Date } = {}
): SkillAuditResult {
  const now = input.now?.() ?? new Date();
  const manifestData = loadSkillBoundaryManifest();
  const rows = db
    .prepare(
      `SELECT id, name, owner, source_harness, verification_checks, imported_at, raw_body, dispatch_status
       FROM skill_registry
       ORDER BY name ASC, source_harness ASC`
    )
    .all() as SkillRow[];

  const triggerCounts = new Map<string, number>();
  for (const row of rows) {
    const key = row.name.trim().toLowerCase();
    triggerCounts.set(key, (triggerCounts.get(key) ?? 0) + 1);
  }

  const findings: SkillAuditFinding[] = [];
  const proposalDrafts: SkillAuditProposalDraft[] = [];
  const proposalsToPersist: SkillForgeProposal[] = [];

  for (const row of rows) {
    const skillFindings: SkillAuditFinding[] = [];
    const base = {
      skillId: String(row.id),
      skillName: row.name,
      sourceHarness: row.source_harness,
    };

    if (!row.owner?.trim()) {
      skillFindings.push({
        ...base,
        code: "missing_owner",
        severity: "high",
        summary: "Skill registry entry is missing an owner.",
      });
    }

    if (!row.verification_checks?.trim()) {
      skillFindings.push({
        ...base,
        code: "missing_smoke_test",
        severity: "medium",
        summary: "Skill registry entry is missing verification_checks smoke coverage.",
      });
    }

    if (daysSince(row.imported_at, now) > STALE_REVIEW_DAYS) {
      skillFindings.push({
        ...base,
        code: "stale_review_date",
        severity: "medium",
        summary: `Skill has not been reviewed in ${STALE_REVIEW_DAYS}+ days.`,
        evidence: row.imported_at,
      });
    }

    if ((triggerCounts.get(row.name.trim().toLowerCase()) ?? 0) > 1) {
      skillFindings.push({
        ...base,
        code: "duplicate_trigger",
        severity: "medium",
        summary: "Duplicate skill name appears across harnesses and may collide on trigger.",
      });
    }

    for (const unsafe of UNSAFE_TOOL_PATTERNS) {
      if (unsafe.pattern.test(row.raw_body)) {
        skillFindings.push({
          ...base,
          code: unsafe.code,
          severity: "high",
          summary: unsafe.summary,
        });
      }
    }

    if (!hasExamples(row.raw_body)) {
      skillFindings.push({
        ...base,
        code: "no_examples",
        severity: "low",
        summary: "Skill body has no obvious usage example section or fenced example block.",
      });
    }

    if (!hasUsageEvidence(db, row.name, row.source_harness)) {
      skillFindings.push({
        ...base,
        code: "no_usage_evidence",
        severity: "low",
        summary: "No dispatch or hive-action evidence references this skill.",
      });
    }

    findings.push(...skillFindings);

    if (skillFindings.length > 0) {
      const proposal = draftProposalFromFindings(row, skillFindings, now);
      proposalDrafts.push({
        proposalId: proposal.id,
        skillId: String(row.id),
        skillName: row.name,
        sourceHarness: row.source_harness,
        status: "pending_approval",
        summary: `Skill audit drafted ${skillFindings.length} finding(s) for operator review.`,
        findings: skillFindings.map((finding) => finding.code),
      });
      proposalsToPersist.push(proposal);
    }
  }

  let persistedProposalIds: string[] = [];
  if (input.persistProposals !== false && proposalsToPersist.length > 0) {
    persistProposals(db, proposalsToPersist);
    persistedProposalIds = proposalsToPersist.map((proposal) => proposal.id);
  }

  return {
    auditedAt: now.toISOString(),
    manifestVersion: manifestData.version,
    skillsScanned: rows.length,
    findings,
    proposalDrafts,
    persistedProposalIds,
  };
}
