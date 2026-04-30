import { NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import path from "path";
import { SKILLS_PATH, SKILL_CONTRIBUTIONS_LOG, FAILURES_LOG } from "@/lib/constants";
import { parseFailuresLog, aggregateFailures } from "@/lib/failures-parser";
import { readSkillBudgetReport } from "@/lib/skill-budget";

export const dynamic = "force-dynamic";

const SKILL_SYNC_STATE = path.join(
  process.env.HOME || "",
  ".openclaw/skill-sync-state.json"
);

interface JournalEvent {
  skill: string;
  action: string;
  contributor: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export async function GET() {
  // 1. Count skills in master dir (exclude dot-prefixed dirs and non-directories)
  let totalSkills = 0;
  let skillDirNames: string[] = [];
  try {
    const entries = await readdir(SKILLS_PATH, { withFileTypes: true });
    skillDirNames = entries
      .filter(e => e.isDirectory() && !e.name.startsWith("."))
      .map(e => e.name);
    totalSkills = skillDirNames.length;
  } catch {
    /* directory inaccessible — return 0 */
  }

  // 2. Read sync state for lastPruned and lastUpdated
  let lastPruned: string | null = null;
  let lastUpdated: string | null = null;
  let skillUsage: Record<string, unknown> = {};
  try {
    const raw = await readFile(SKILL_SYNC_STATE, "utf-8");
    const state = JSON.parse(raw);
    lastPruned = state.last_prune ?? null;
    lastUpdated = state.last_sync ?? null;
    if (state.skill_usage && typeof state.skill_usage === "object") {
      skillUsage = state.skill_usage as Record<string, unknown>;
    }
  } catch {
    /* state file may not exist — null is correct, skillUsage stays {} */
  }

  // 3. Compute coverage gaps — skills with no usage or unused for 30+ days
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const coverageGaps: string[] = skillDirNames.filter(name => {
    const raw = skillUsage[name];
    if (raw == null) return true;                          // never used
    const ts = typeof raw === "number" ? raw : new Date(String(raw)).getTime();
    if (!Number.isFinite(ts)) return true;                 // malformed timestamp → treat as unused
    return (now - ts) > THIRTY_DAYS_MS;                    // stale (strictly > 30 days)
  });

  // 4. Parse JSONL for contribution stats
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

  return NextResponse.json({
    totalSkills,
    allSkills: skillDirNames,
    contributedByHermes,
    contributedByGwen,
    recentContributions,
    lastPruned,
    staleCandidates,
    coverageGaps,
    lastUpdated,
    failuresByAgent,
    failuresByErrorType,
    contributionHistory,
    skillBudget,
    timestamp: new Date().toISOString(),
  });
}
