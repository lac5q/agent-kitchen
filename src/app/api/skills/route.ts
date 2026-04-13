import { NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import path from "path";
import { SKILLS_PATH, SKILL_CONTRIBUTIONS_LOG } from "@/lib/constants";

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

  try {
    const raw = await readFile(SKILL_CONTRIBUTIONS_LOG, "utf-8");
    const lines = raw.split("\n").filter(l => l.trim());
    const events: JournalEvent[] = [];

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

  return NextResponse.json({
    totalSkills,
    contributedByHermes,
    contributedByGwen,
    recentContributions,
    lastPruned,
    staleCandidates,
    coverageGaps,
    lastUpdated,
    timestamp: new Date().toISOString(),
  });
}
