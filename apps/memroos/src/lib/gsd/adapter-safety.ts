import type Database from "better-sqlite3";

import { scanContent } from "@/lib/content-scanner";

export type GsdSafetyActionKind = "send" | "write" | "destructive" | "memory_persist";

export interface GsdSafetyCheckInput {
  action: GsdSafetyActionKind;
  content: string;
  actorAgentId: string;
  goalId?: string;
  estimatedCostUsd?: number;
  costCapUsd?: number;
  sharedMode?: boolean;
  requestedLocalGitFallback?: boolean;
  destructive?: boolean;
  approvalGranted?: boolean;
}

export interface GsdSafetyCheckResult {
  allowed: boolean;
  blockedReasons: string[];
  scanMatches: Array<{ patternName: string; severity: string }>;
  receiptId?: number;
  honestDegradation?: string;
}

const DEFAULT_COST_CAP_USD = 25;

function writeSafetyReceipt(db: Database.Database, input: GsdSafetyCheckInput, result: GsdSafetyCheckResult): number {
  const summary = result.allowed ? `GSD safety allowed ${input.action}` : `GSD safety blocked ${input.action}`;
  const insert = db
    .prepare(
      `INSERT INTO hive_actions(agent_id, action_type, summary, artifacts)
       VALUES (@agentId, 'checkpoint', @summary, @artifacts)`
    )
    .run({
      agentId: input.actorAgentId,
      summary,
      artifacts: JSON.stringify({
        command: "adapter_safety",
        action: input.action,
        goalId: input.goalId,
        allowed: result.allowed,
        blockedReasons: result.blockedReasons,
        scanMatches: result.scanMatches,
        honestDegradation: result.honestDegradation,
      }),
    });
  return Number(insert.lastInsertRowid);
}

export function runGsdAdapterSafetyCheck(db: Database.Database, input: GsdSafetyCheckInput): GsdSafetyCheckResult {
  const blockedReasons: string[] = [];
  const scan = scanContent(input.content);
  const scanMatches = scan.matches.map((match) => ({ patternName: match.patternName, severity: match.severity }));

  if (scan.blocked) {
    blockedReasons.push("secrets_or_pii_scan_blocked");
  }

  if (input.destructive || input.action === "destructive") {
    if (!input.approvalGranted) {
      blockedReasons.push("destructive_action_requires_approval");
    }
  }

  const cap = input.costCapUsd ?? DEFAULT_COST_CAP_USD;
  if (typeof input.estimatedCostUsd === "number" && input.estimatedCostUsd > cap) {
    blockedReasons.push("cost_cap_exceeded");
  }

  let honestDegradation: string | undefined;
  if (input.sharedMode && input.requestedLocalGitFallback) {
    blockedReasons.push("shared_mode_local_git_fallback_forbidden");
    honestDegradation = "Shared/enterprise mode cannot silently fall back to local git corpus pulls.";
  }

  const result: GsdSafetyCheckResult = {
    allowed: blockedReasons.length === 0,
    blockedReasons,
    scanMatches,
    honestDegradation,
  };

  result.receiptId = writeSafetyReceipt(db, input, result);
  return result;
}
