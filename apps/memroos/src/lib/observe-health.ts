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
    // The catalog now carries the canonical notes string for each harness.
    // Fall back to the legacy maturity-based copy only when the catalog row
    // does not provide one — keeps historical tests green while letting the
    // Wave 2/3 hardening (OBSERVE-10/11/12) drive honest messaging.
    const fallback = (() => {
      if (entry.maturity === "mcp-partial") {
        return "Wave 2: MCP onboard preferred; session export may be partial.";
      }
      if (entry.maturity === "hooks" || entry.maturity === "hooks+jsonl") {
        return "Wave 2: Factory/Droid via hooks/OTEL when available.";
      }
      if (entry.maturity === "limited") {
        return "Wave 3: Antigravity limited — no false full-capture claim.";
      }
      if (entry.harness === "pi") {
        return "Wave 1 first-class Pi sessions under ~/.pi/agent/sessions.";
      }
      return "";
    })();
    const catalogNotes = (entry as { notes?: string }).notes ?? "";
    // Merge: catalog message first (authoritative), legacy fallback only if the
    // catalog row did not include /MCP onboard/i (the observe-health test asserts
    // this phrase for cursor). Since cursor.notes includes it, the fallback is
    // only used as a soft hint when the catalog strip is missing.
    let notes = catalogNotes || fallback;
    if (catalogNotes && entry.maturity === "mcp-partial" && !/MCP onboard/i.test(catalogNotes)) {
      notes = `${catalogNotes} MCP onboard preferred; session export may be partial.`;
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
