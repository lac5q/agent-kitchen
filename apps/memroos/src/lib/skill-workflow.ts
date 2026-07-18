import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type SkillWorkflowStage = "agent-limited" | "general" | "enterprise";
export type SkillReviewStatus =
  | "unreviewed"
  | "in-review"
  | "changes-requested"
  | "approved"
  | "enterprise-ready";

export interface SkillReviewRecord {
  stage: SkillWorkflowStage;
  status: SkillReviewStatus;
  notes: string;
  draftBody: string;
  changeReason: string;
  updatedAt: string;
  updatedBy: string;
  approvedAt?: string | null;
}

export interface SkillWorkflowItem {
  name: string;
  title: string;
  path: string;
  description: string;
  bodyPreview: string;
  stage: SkillWorkflowStage;
  reviewStatus: SkillReviewStatus;
  reviewNotes: string;
  draftBody: string;
  owner: string;
  tags: string[];
  health: "ready" | "coverage-gap" | "needs-source" | "stale";
  lastActivityAt: string | null;
  maturityScore: number;
  updatedAt: string | null;
  approvedAt: string | null;
  usageCount: number;
  changeReason: string;
}

type ReviewState = Record<string, SkillReviewRecord>;

interface BuildSkillWorkflowItemsInput {
  skillsPath: string;
  skillNames: string[];
  coverageGaps: string[];
  skillUsage: Record<string, unknown>;
  reviewState: ReviewState;
  /** Optional per-skill root override (for multi-root inventory). */
  skillPathByName?: Record<string, string>;
}

export interface UpdateSkillReviewInput {
  skillName: string;
  action: "save-draft" | "request-changes" | "approve-general" | "promote-enterprise";
  notes?: string;
  draftBody?: string;
  changeReason?: string;
  actor?: string;
}

const VALID_STAGES: SkillWorkflowStage[] = ["agent-limited", "general", "enterprise"];
const VALID_STATUSES: SkillReviewStatus[] = [
  "unreviewed",
  "in-review",
  "changes-requested",
  "approved",
  "enterprise-ready",
];

export function skillReviewStatePath() {
  return (
    process.env.SKILL_REVIEW_STATE_PATH ||
    path.join(process.cwd(), "data", "skill-review-state.json")
  );
}

export async function readSkillReviewState(): Promise<ReviewState> {
  try {
    const raw = await readFile(skillReviewStatePath(), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const state: ReviewState = {};
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const record = value as Partial<SkillReviewRecord>;
      if (!VALID_STAGES.includes(record.stage as SkillWorkflowStage)) continue;
      if (!VALID_STATUSES.includes(record.status as SkillReviewStatus)) continue;
      state[name] = {
        stage: record.stage as SkillWorkflowStage,
        status: record.status as SkillReviewStatus,
        notes: typeof record.notes === "string" ? record.notes : "",
        draftBody: typeof record.draftBody === "string" ? record.draftBody : "",
        changeReason: typeof record.changeReason === "string" ? record.changeReason : "",
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
        updatedBy: typeof record.updatedBy === "string" ? record.updatedBy : "unknown",
        approvedAt: typeof record.approvedAt === "string" ? record.approvedAt : null,
      };
    }
    return state;
  } catch {
    return {};
  }
}

export async function writeSkillReviewState(state: ReviewState) {
  const target = skillReviewStatePath();
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

export async function updateSkillReviewState(input: UpdateSkillReviewInput) {
  if (!/^[\w.-]+$/.test(input.skillName)) {
    throw new Error("Invalid skill name");
  }

  const state = await readSkillReviewState();
  const previous = state[input.skillName];
  const now = new Date().toISOString();
  const next: SkillReviewRecord = {
    stage: previous?.stage ?? "agent-limited",
    status: previous?.status ?? "in-review",
    notes: input.notes ?? previous?.notes ?? "",
    draftBody: input.draftBody ?? previous?.draftBody ?? "",
    changeReason: input.changeReason ?? previous?.changeReason ?? "",
    updatedAt: now,
    updatedBy: input.actor ?? "operator",
    approvedAt: previous?.approvedAt ?? null,
  };

  if (input.action === "request-changes") {
    next.status = "changes-requested";
    next.stage = previous?.stage ?? "agent-limited";
    next.approvedAt = null;
  } else if (input.action === "approve-general") {
    next.status = "approved";
    next.stage = "general";
    next.approvedAt = now;
  } else if (input.action === "promote-enterprise") {
    if (previous?.stage !== "general" || previous?.status !== "approved") {
      throw new Error("Skill must be approved at general stage before promoting to enterprise");
    }
    next.status = "enterprise-ready";
    next.stage = "enterprise";
    next.approvedAt = now;
  } else {
    next.status = previous?.status ?? "in-review";
  }

  state[input.skillName] = next;
  await writeSkillReviewState(state);
  return next;
}

export async function buildSkillWorkflowItems({
  skillsPath,
  skillNames,
  coverageGaps,
  skillUsage,
  reviewState,
  skillPathByName,
}: BuildSkillWorkflowItemsInput): Promise<SkillWorkflowItem[]> {
  const gapSet = new Set(coverageGaps);
  const items = await Promise.all(
    skillNames.map(async (name) => {
      const root = skillPathByName?.[name] || skillsPath;
      const skillPath = path.join(root, name, "SKILL.md");
      const raw = await readSkillBody(skillPath);
      const metadata = parseMetadata(raw);
      const title = metadata.name || firstHeading(raw) || name;
      const description = metadata.description || firstParagraph(raw) || "No description recorded yet.";
      const review = reviewState[name];
      const stage = review?.stage ?? metadataStage(metadata, raw);
      const reviewStatus = review?.status ?? defaultStatus(stage, gapSet.has(name), raw);
      const lastActivityAt = lastActivity(skillUsage[name]);
      const health: SkillWorkflowItem["health"] = raw
        ? gapSet.has(name)
          ? "coverage-gap"
          : "ready"
        : "needs-source";
      const bodyPreview = normalizeWhitespace(stripMarkdown(raw)).slice(0, 360);

      const usageRaw = skillUsage[name];
      const usageCount =
        typeof usageRaw === "number"
          ? usageRaw
          : usageRaw && typeof (usageRaw as Record<string, unknown>).count === "number"
            ? (usageRaw as Record<string, unknown>).count as number
            : 0;

      return {
        name,
        title,
        path: skillPath,
        description,
        bodyPreview,
        stage,
        reviewStatus,
        reviewNotes: review?.notes ?? "",
        draftBody: review?.draftBody ?? "",
        changeReason: review?.changeReason ?? "",
        owner: metadata.owner || metadata.author || "unassigned",
        tags: parseTags(metadata.tags, raw),
        health,
        lastActivityAt,
        maturityScore: maturityScore({ raw, description, stage, reviewStatus, hasGap: gapSet.has(name) }),
        updatedAt: review?.updatedAt || null,
        approvedAt: review?.approvedAt || null,
        usageCount,
      };
    })
  );

  return items.sort((a, b) => {
    const stageOrder: Record<SkillWorkflowStage, number> = {
      "agent-limited": 0,
      general: 1,
      enterprise: 2,
    };
    return stageOrder[a.stage] - stageOrder[b.stage] || a.title.localeCompare(b.title);
  });
}

async function readSkillBody(skillPath: string) {
  try {
    const raw = await readFile(skillPath, "utf-8");
    return typeof raw === "string" ? raw : "";
  } catch {
    return "";
  }
}

function parseMetadata(raw: string) {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {} as Record<string, string>;
  return Object.fromEntries(
    match[1]
      .split("\n")
      .map((line) => line.match(/^([\w-]+):\s*(.*)$/))
      .filter(Boolean)
      .map((lineMatch) => [
        lineMatch![1],
        lineMatch![2].replace(/^["']|["']$/g, "").trim(),
      ])
  );
}

function firstHeading(raw: string) {
  return raw.match(/^#\s+(.+)$/m)?.[1]?.trim();
}

function firstParagraph(raw: string) {
  return normalizeWhitespace(
    stripMarkdown(raw.replace(/^---\n[\s\S]*?\n---/, ""))
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 40) ?? ""
  );
}

function stripMarkdown(raw: string) {
  return raw
    .replace(/^---\n[\s\S]*?\n---/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`[\]()-]/g, " ");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function metadataStage(metadata: Record<string, string>, raw: string): SkillWorkflowStage {
  const candidate = metadata.stage || metadata.scope || metadata.lifecycle;
  if (VALID_STAGES.includes(candidate as SkillWorkflowStage)) return candidate as SkillWorkflowStage;
  const haystack = `${metadata.description ?? ""} ${raw}`.toLowerCase();
  if (haystack.includes("enterprise") || haystack.includes("compliance") || haystack.includes("governance")) {
    return "enterprise";
  }
  if (haystack.includes("use when") || haystack.includes("workflow")) return "general";
  return "agent-limited";
}

function defaultStatus(stage: SkillWorkflowStage, hasGap: boolean, raw: string): SkillReviewStatus {
  if (!raw || hasGap) return "in-review";
  if (stage === "enterprise") return "enterprise-ready";
  if (stage === "general") return "approved";
  return "unreviewed";
}

function lastActivity(raw: unknown) {
  if (raw == null) return null;
  if (typeof raw === "number") return new Date(raw).toISOString();
  const parsed = new Date(String(raw));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function parseTags(rawTags: string | undefined, raw: string) {
  const tags = new Set<string>();
  if (rawTags) {
    rawTags.split(/[,\s]+/).forEach((tag) => {
      if (tag) tags.add(tag.replace(/^["'\[]|["'\]]$/g, ""));
    });
  }
  const haystack = raw.toLowerCase();
  ["security", "memory", "workflow", "frontend", "research", "governance", "testing"].forEach((tag) => {
    if (haystack.includes(tag)) tags.add(tag);
  });
  return Array.from(tags).slice(0, 6);
}

function maturityScore(input: {
  raw: string;
  description: string;
  stage: SkillWorkflowStage;
  reviewStatus: SkillReviewStatus;
  hasGap: boolean;
}) {
  let score = input.raw ? 35 : 10;
  if (input.description.length > 60) score += 15;
  if (input.raw.includes("##") || input.raw.includes("<process>")) score += 15;
  if (input.stage === "general") score += 10;
  if (input.stage === "enterprise") score += 20;
  if (input.reviewStatus === "approved") score += 10;
  if (input.reviewStatus === "enterprise-ready") score += 15;
  if (input.hasGap) score -= 20;
  return Math.max(0, Math.min(100, score));
}
