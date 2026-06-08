import { apiError } from "@/lib/api-error";
import { collectLocalFootprintInventory } from "@/lib/cloud-offload/footprint";
import { getDb } from "@/lib/db";
import {
  normalizeNocWindow,
  normalizeNocWorkspace,
  nocWindowToSinceIso,
  type NocWorkspace,
} from "@/lib/noc-filters";

export const dynamic = "force-dynamic";

type PanelStatus = "live" | "empty" | "degraded" | "missing";

function scalar(db: ReturnType<typeof getDb>, sql: string, params: unknown[] = []): number {
  try {
    const row = db.prepare(sql).get(...params) as { value?: number } | undefined;
    return Number(row?.value ?? 0);
  } catch {
    return 0;
  }
}

function workspaceClause(workspace: NocWorkspace) {
  if (workspace === "local") {
    return "AND m.agent_id IN ('codex','claude','claude-code','gemini','hermes','memroos','openclaw','qwen')";
  }
  if (workspace === "remote") {
    return "AND m.agent_id NOT IN ('codex','claude','claude-code','gemini','hermes','memroos','openclaw','qwen')";
  }
  return "";
}

function panel(status: PanelStatus, source: string, lastUpdated: string | null, warnings: string[] = []) {
  return { status, source, lastUpdated, warnings };
}

async function buildNocResponse(request: Request) {
  const url = new URL(request.url);
  const window = normalizeNocWindow(url.searchParams.get("window"));
  const workspace = normalizeNocWorkspace(url.searchParams.get("workspace"));
  const since = nocWindowToSinceIso(window);
  const db = getDb();
  const ws = workspaceClause(workspace);

  const memoryRows = scalar(
    db,
    `SELECT COUNT(*) AS value FROM messages m WHERE m.timestamp >= ? ${ws}`,
    [since]
  );
  const activeDispatches = scalar(
    db,
    "SELECT COUNT(*) AS value FROM hive_delegations WHERE status IN ('pending','active','paused')"
  );
  const failedWork = scalar(
    db,
    "SELECT COUNT(*) AS value FROM hive_delegations WHERE status = 'failed'"
  );
  const governanceEvents = scalar(
    db,
    "SELECT COUNT(*) AS value FROM audit_entries WHERE created_at >= ?",
    [since]
  );
  const enabledSkills = scalar(
    db,
    "SELECT COUNT(*) AS value FROM skill_registry WHERE dispatch_status = 'enabled'"
  );
  const cronWarnings = scalar(
    db,
    "SELECT COUNT(*) AS value FROM cron_health_jobs WHERE status = 'active' AND (warning IS NOT NULL OR last_failure_at IS NOT NULL)"
  );
  const localFootprint = collectLocalFootprintInventory(process.cwd());

  const lastMessage = db
    .prepare(`SELECT MAX(timestamp) AS value FROM messages m WHERE m.timestamp >= ? ${ws}`)
    .get(since) as { value: string | null };

  return Response.json({
    ok: true,
    filters: { window, workspace, since },
    generatedAt: new Date().toISOString(),
    metrics: {
      memoryRows,
      activeDispatches,
      failedWork,
      governanceEvents,
      enabledSkills,
      cronWarnings,
      localFootprintBytes: localFootprint.totalBytes,
    },
    panels: {
      pulse: panel(memoryRows > 0 || activeDispatches > 0 ? "live" : "empty", "SQLite messages + hive_delegations", lastMessage.value),
      memory: panel(memoryRows > 0 ? "live" : "empty", "SQLite messages", lastMessage.value),
      dispatch: panel(activeDispatches > 0 ? "live" : "empty", "hive_delegations", null),
      governance: panel(governanceEvents > 0 ? "live" : "empty", "audit_entries", null),
      skills: panel(enabledSkills > 0 ? "live" : "empty", "skill_registry", null),
      cron: panel(cronWarnings > 0 ? "degraded" : "live", "cron_health_jobs", null),
      localFootprint: panel(
        localFootprint.pressure === "critical" ? "degraded" : "live",
        "local footprint inventory",
        localFootprint.generatedAt,
        localFootprint.warnings
      ),
      efficiency: panel("missing", "retrieval efficiency telemetry", null, [
        "Retrieval calls before useful work",
        "Same-source re-read count",
        "Operator re-ask redundancy",
        "Rediscovered-fact rate",
      ]),
    },
    localFootprint,
  });
}

export async function GET(request: Request) {
  try {
    return await buildNocResponse(request);
  } catch (error: unknown) {
    return apiError(500, error instanceof Error ? error.message : "Internal server error");
  }
}
