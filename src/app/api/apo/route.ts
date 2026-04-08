import { NextResponse } from "next/server";
import { readdir, readFile, stat } from "fs/promises";
import path from "path";
import type { ApoProposal, ApoCycleStats } from "@/types";

export const dynamic = "force-dynamic";

const PROPOSALS_PATH =
  process.env.APO_PROPOSALS_PATH ||
  `${process.env.HOME}/.openclaw/skills/proposals`;
const CRON_LOG_PATH =
  process.env.APO_CRON_LOG_PATH ||
  `${process.env.HOME}/.openclaw/logs/agent-lightning-cron.log`;

async function parseProposal(
  filePath: string,
  status: "pending" | "archived"
): Promise<ApoProposal | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const filename = path.basename(filePath);
    // Parse: APO_PROPOSAL_[skill]_[subsystem]_[timestamp].md
    const match = filename.match(
      /^APO_PROPOSAL_(.+?)_(.+?)_(\d{8}_\d{6}|\d+)\.md$/
    );
    const fileStat = await stat(filePath);

    return {
      id: filename,
      filename,
      skill: match?.[1]?.replace(/-/g, " ") || filename,
      subsystem: match?.[2]?.replace(/-/g, " ") || "unknown",
      timestamp: fileStat.mtime.toISOString(),
      content,
      status,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const proposals: ApoProposal[] = [];

  // Read active proposals
  try {
    const files = await readdir(PROPOSALS_PATH);
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    for (const f of mdFiles) {
      const proposal = await parseProposal(
        path.join(PROPOSALS_PATH, f),
        "pending"
      );
      if (proposal) proposals.push(proposal);
    }
  } catch {
    /* no proposals dir */
  }

  // Read archived proposals
  const archivedPath = path.join(PROPOSALS_PATH, "archived");
  try {
    const files = await readdir(archivedPath);
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    for (const f of mdFiles) {
      const proposal = await parseProposal(
        path.join(archivedPath, f),
        "archived"
      );
      if (proposal) proposals.push(proposal);
    }
  } catch {
    /* no archived dir */
  }

  // Read recent cron log lines
  let recentLogLines: string[] = [];
  let lastRun: string | null = null;
  try {
    const log = await readFile(CRON_LOG_PATH, "utf-8");
    const lines = log.split("\n").filter((l) => l.trim());
    recentLogLines = lines.slice(-50); // last 50 lines
    // Find last run timestamp from log
    const runLines = lines.filter(
      (l) =>
        l.includes("Starting") ||
        l.includes("APO cycle") ||
        l.includes("[CRON]")
    );
    if (runLines.length > 0) {
      const lastRunLine = runLines[runLines.length - 1];
      const dateMatch = lastRunLine.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/);
      lastRun = dateMatch?.[0] || null;
    }
    if (!lastRun) {
      const logStat = await stat(CRON_LOG_PATH);
      lastRun = logStat.mtime.toISOString();
    }
  } catch {
    /* no log */
  }

  const pending = proposals.filter((p) => p.status === "pending");
  const archived = proposals.filter((p) => p.status === "archived");

  const stats: ApoCycleStats = {
    lastRun,
    totalProposals: proposals.length,
    pendingProposals: pending.length,
    archivedProposals: archived.length,
    recentLogLines,
  };

  // Sort proposals by timestamp descending
  proposals.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return NextResponse.json({
    proposals,
    stats,
    timestamp: new Date().toISOString(),
  });
}
