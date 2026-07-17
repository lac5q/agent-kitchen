import { NextResponse } from "next/server";
import { readFile, readdir, access } from "fs/promises";
import path from "path";
import { apiError } from "@/lib/api-error";
import { SKILLS_PATH, SKILL_CONTRIBUTIONS_LOG, FAILURES_LOG } from "@/lib/constants";
import { parseFailuresLog, aggregateFailures } from "@/lib/failures-parser";
import { readSkillBudgetReport } from "@/lib/skill-budget";
import { buildSkillWorkflowItems, readSkillReviewState } from "@/lib/skill-workflow";
import { resolveFromRepoRoot } from "@/lib/paths";

export const dynamic = "force-dynamic";

const SKILL_SYNC_STATE = path.join(
  process.env.HOME || "",
  ".openclaw/skill-sync-state.json"
);

/** Extra skill roots that ship with the repo (cloud/Heroku often lack ~/.claude/skills). */
async function bundledSkillRoots(): Promise<string[]> {
  const candidates = [
    resolveFromRepoRoot("docs/codex-cloud/skills"),
    resolveFromRepoRoot(".agents/skills"),
    resolveFromRepoRoot("apps/memroos/.agents/skills"),
  ];
  const roots: string[] = [];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      roots.push(candidate);
    } catch {
      /* missing is fine */
    }
  }
  return roots;
}

async function listSkillDirNames(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

interface JournalEvent {
  skill: string;
  action: string;
  contributor: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

async function buildSkillsResponse() {
  // 1. Count skills from configured path + repo-bundled roots (dedupe by name).
  const skillNameSet = new Set<string>();
  const skillSources: Array<{ root: string; names: string[] }> = [];

  const primaryNames = await listSkillDirNames(SKILLS_PATH);
  skillSources.push({ root: SKILLS_PATH, names: primaryNames });
  for (const name of primaryNames) skillNameSet.add(name);

  for (const root of await bundledSkillRoots()) {
    const names = await listSkillDirNames(root);
    skillSources.push({ root, names });
    for (const name of names) skillNameSet.add(name);
  }

  const skillDirNames = Array.from(skillNameSet).sort();
  const totalSkills = skillDirNames.length;

  // 2. Read sync state for lastPruned and lastUpdated
  let lastPruned: string | null = null;
  let lastUpdated: string | null = null;
  let skillUsage: Record<string, unknown> = {};
  let hasUsageTelemetry = false;
  try {
    const raw = await readFile(SKILL_SYNC_STATE, "utf-8");
    const state = JSON.parse(raw);
    lastPruned = state.last_prune ?? null;
    lastUpdated = state.last_sync ?? null;
    if (state.skill_usage && typeof state.skill_usage === "object") {
      skillUsage = state.skill_usage as Record<string, unknown>;
      hasUsageTelemetry = Object.keys(skillUsage).length > 0;
    }
  } catch {
    /* state file may not exist — null is correct, skillUsage stays {} */
  }

  // 3. Parse JSONL for contribution stats and recent skill activity signals.
  let recentContributions: Array<{
    skill: string;
    contributor: string;
    timestamp: string;
    action: string;
  }> = [];
  let contributedByHermes = 0;
  let contributedByGwen = 0;
  let staleCandidates = 0;
  const events: JournalEvent[] = [];

  try {
    const raw = await readFile(SKILL_CONTRIBUTIONS_LOG, "utf-8");
    const lines = raw.split("\n").filter(l => l.trim());

    for (const line of lines) {
      try {
        events.push(JSON.parse(line) as JournalEvent);
      } catch {
        /* skip malformed lines */
      }
    }

    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    recentContributions = events
      .filter(e => new Date(e.timestamp).getTime() > twoHoursAgo)
      .map(e => ({
        skill: e.skill,
        contributor: e.contributor,
        timestamp: e.timestamp,
        action: e.action,
      }))
      .slice(-20);

    contributedByHermes = events.filter(
      e => e.contributor === "hermes" && e.action === "contributed"
    ).length;
    contributedByGwen = events.filter(
      e => e.contributor === "gwen" && e.action === "contributed"
    ).length;
    staleCandidates = events.filter(e => e.action === "pruned").length;
  } catch {
    /* JSONL empty or missing — all zeros is correct initial state */
  }

  const usageActions = new Set(["used", "invoked", "synced", "failed", "contributed"]);
  for (const ev of events) {
    if (!skillDirNames.includes(ev.skill) || !usageActions.has(ev.action)) continue;
    const ts = new Date(ev.timestamp).getTime();
    if (!Number.isFinite(ts)) continue;
    const existing = skillUsage[ev.skill];
    const existingTs = typeof existing === "number" ? existing : new Date(String(existing)).getTime();
    if (!Number.isFinite(existingTs) || ts > existingTs) {
      skillUsage[ev.skill] = ev.timestamp;
    }
    hasUsageTelemetry = true;
  }

  // 4. Compute coverage gaps only when usage telemetry exists. Missing telemetry is not evidence
  // that every skill is stale; show it as untracked instead of a false 100% gap.
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const coverageGaps: string[] = hasUsageTelemetry
    ? skillDirNames.filter(name => {
        const raw = skillUsage[name];
        if (raw == null) return true;                          // never used while telemetry exists
        const ts = typeof raw === "number" ? raw : new Date(String(raw)).getTime();
        if (!Number.isFinite(ts)) return true;                 // malformed timestamp -> treat as unused
        return (now - ts) > THIRTY_DAYS_MS;                    // stale (strictly > 30 days)
      })
    : [];
  const coverageTelemetryStatus = hasUsageTelemetry ? "tracked" : "untracked";

  // 5. Parse failures.log for agent/error_type aggregates (SKILL-06)
  let failuresByAgent: Record<string, number> = {};
  let failuresByErrorType: Record<string, number> = {};
  try {
    const entries = await parseFailuresLog(FAILURES_LOG);
    const agg = aggregateFailures(entries);
    failuresByAgent = agg.failuresByAgent;
    failuresByErrorType = agg.failuresByErrorType;
  } catch {
    /* parser already returns [] on ENOENT; defensive catch for any other I/O surprise */
  }

  // 6. Build 30-day contributionHistory from the events array (SKILL-08)
  // Counts both `synced` and `failed` actions; ignores pruned/contributed/etc.
  // Operates on the already-parsed `events` array — does NOT re-read SKILL_CONTRIBUTIONS_LOG.
  const THIRTY_DAYS_MS_HEATMAP = 30 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - THIRTY_DAYS_MS_HEATMAP;
  const buckets = new Map<string, number>(); // key = `${skill}|${date}`
  for (const ev of events) {
    if (ev.action !== "synced" && ev.action !== "failed") continue;
    const ts = new Date(ev.timestamp).getTime();
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    const date = new Date(ts).toISOString().slice(0, 10);
    const key = `${ev.skill}|${date}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const contributionHistory = Array.from(buckets.entries())
    .map(([key, count]) => {
      const [skill, date] = key.split("|");
      return { skill, date, count };
    })
    .sort((a, b) =>
      a.skill === b.skill
        ? a.date.localeCompare(b.date)
        : a.skill.localeCompare(b.skill)
    );
  const skillBudget = await readSkillBudgetReport();
  const reviewState = await readSkillReviewState();
  // Prefer the first root that actually contains each skill's SKILL.md.
  const skillRootByName = new Map<string, string>();
  for (const { root, names } of skillSources) {
    for (const name of names) {
      if (!skillRootByName.has(name)) skillRootByName.set(name, root);
    }
  }
  const detailRoots = Array.from(new Set(skillRootByName.values()));
  const skillDetailsNested = await Promise.all(
    detailRoots.map((root) =>
      buildSkillWorkflowItems({
        skillsPath: root,
        skillNames: skillDirNames.filter((name) => skillRootByName.get(name) === root),
        coverageGaps,
        skillUsage,
        reviewState,
      })
    )
  );
  const skillDetails = skillDetailsNested.flat().sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    totalSkills,
    allSkills: skillDirNames,
    skillDetails,
    skillSources: skillSources.map(({ root, names }) => ({
      root,
      count: names.length,
    })),
    contributedByHermes,
    contributedByGwen,
    recentContributions,
    lastPruned,
    staleCandidates,
    coverageGaps,
    coverageTelemetryStatus,
    lastUpdated,
    failuresByAgent,
    failuresByErrorType,
    contributionHistory,
    skillBudget,
    timestamp: new Date().toISOString(),
  });
}

export async function GET() {
  try {
    return await buildSkillsResponse();
  } catch (error: unknown) {
    return apiError(500, error instanceof Error ? error.message : "Internal server error");
  }
}
