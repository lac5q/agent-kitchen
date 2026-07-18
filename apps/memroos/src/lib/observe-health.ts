/**
 * Observe capture health / maturity visibility (v8.16 Phase 171).
 */
import type Database from "better-sqlite3";

import {
  OBSERVE_HARNESS_PATHS,
  type ObserveHarness,
} from "@/lib/observe-sidecar";

export interface ObserveHarnessHealth {
  harness: ObserveHarness;
  wave: 1 | 2 | 3;
  maturity: string;
  lastCaptureAt: string | null;
  captureCount: number;
  depthSetting: string;
  errorRate: number | null;
  notes: string;
}

export function listObserveHarnessHealth(
  db: Database.Database,
  options: { depthSetting?: string } = {}
): ObserveHarnessHealth[] {
  const depthSetting =
    options.depthSetting ??
    process.env.MEMROOS_CAPTURE_DEPTH ??
    "relevant";

  const rows = db
    .prepare(
      `SELECT runtime AS harness,
              MAX(captured_at) AS lastCaptureAt,
              COUNT(*) AS captureCount
       FROM agent_session_captures
       GROUP BY runtime`
    )
    .all() as Array<{ harness: string; lastCaptureAt: string | null; captureCount: number }>;

  const byHarness = new Map(
    rows.map((row) => [String(row.harness).toLowerCase(), row] as const)
  );

  return OBSERVE_HARNESS_PATHS.map((entry) => {
    const hit = byHarness.get(entry.harness);
    let notes = "";
    if (entry.maturity === "mcp-partial") {
      notes = "Wave 2: MCP onboard preferred; session export may be partial.";
    } else if (entry.maturity === "hooks") {
      notes = "Wave 2: Factory/Droid via hooks/OTEL when available.";
    } else if (entry.maturity === "limited") {
      notes = "Wave 3: Antigravity limited — no false full-capture claim.";
    } else if (entry.harness === "pi") {
      notes = "Wave 1 first-class Pi sessions under ~/.pi/agent/sessions.";
    }

    return {
      harness: entry.harness,
      wave: entry.wave,
      maturity: entry.maturity,
      lastCaptureAt: hit?.lastCaptureAt ?? null,
      captureCount: Number(hit?.captureCount ?? 0),
      depthSetting,
      errorRate: null,
      notes,
    };
  });
}
