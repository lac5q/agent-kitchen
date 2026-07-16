import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { cacheKey, responseCache } from "@/lib/response-cache";
import {
  metricEnvelope,
  type MetricEnvelope,
  type MetricScope,
} from "@/lib/metric-status";

export const dynamic = "force-dynamic";

type SecurityStatus = "clear" | "watch" | "attention";

interface AuditRow {
  id: number;
  actor: string;
  action: string;
  target: string;
  detail: string | null;
  severity: "info" | "medium" | "high";
  timestamp: string;
}

const SECURITY_TERMS = [
  "agent-shield",
  "blocked",
  "capability",
  "denied",
  "iris",
  "policy",
  "secret",
  "security",
];

function clampLimit(raw: string | null): number {
  const parsed = raw !== null ? Number(raw) : 20;
  return Math.min(100, Math.max(1, Number.isNaN(parsed) ? 20 : parsed));
}

function isSecurityEvent(row: AuditRow): boolean {
  const haystack = `${row.action} ${row.target} ${row.detail ?? ""}`.toLowerCase();
  return SECURITY_TERMS.some((term) => haystack.includes(term));
}

function isBlockedEvent(row: AuditRow): boolean {
  const haystack = `${row.action} ${row.target} ${row.detail ?? ""}`.toLowerCase();
  return ["blocked", "denied", "rejected", "policy_denied"].some((term) => haystack.includes(term));
}

function redactDetail(detail: string | null): string | null {
  if (!detail) return null;
  return detail
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/\bak_[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/("?(?:api[_-]?key|token|secret)"?\s*[:=]\s*)"[^"]+"/gi, "$1\"[redacted]\"");
}

function statusFor(rows: AuditRow[]): SecurityStatus {
  if (rows.some((row) => row.severity === "high")) return "attention";
  if (rows.some((row) => row.severity === "medium" || isBlockedEvent(row))) return "watch";
  return "clear";
}

function topActors(rows: AuditRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.actor, (counts.get(row.actor) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5);
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const limit = clampLimit(url.searchParams.get("limit"));
  const db = getDb();
  const version = db
    .prepare(
      `SELECT
         COUNT(*) as count,
         MAX(id) as maxId,
         MAX(timestamp) as lastTimestamp,
         (
           SELECT group_concat(id || ':' || timestamp || ':' || action || ':' || target || ':' || severity, '|')
           FROM (
             SELECT id, timestamp, action, target, severity
             FROM audit_log
             ORDER BY id DESC
             LIMIT 20
           )
         ) as fingerprint
       FROM audit_log`
    )
    .get() as { count: number; maxId: number | null; lastTimestamp: string | null; fingerprint: string | null };
  return Response.json(
    await responseCache.getOrSet(
      "security-report",
      cacheKey([limit, version.count, version.maxId, version.lastTimestamp, version.fingerprint]),
      5_000,
      async () => buildSecurityReport(limit),
      ["security", "audit"]
    )
  );
}

function buildSecurityReport(limit: number) {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT id, actor, action, target, detail, severity, timestamp
       FROM audit_log
       ORDER BY timestamp DESC
       LIMIT 250`
    )
    .all() as AuditRow[];

  const securityRows = rows.filter(isSecurityEvent);
  const timeline = securityRows.slice(0, limit).map((row) => ({
    ...row,
    detail: redactDetail(row.detail),
    blocked: isBlockedEvent(row),
  }));
  const auditActivity = rows.slice(0, limit).map((row) => ({
    ...row,
    detail: redactDetail(row.detail),
    blocked: isBlockedEvent(row),
    securityEvent: isSecurityEvent(row),
  }));

  const summaryStatus: "clear" | "watch" | "attention" = statusFor(securityRows);
  const lastAuditAtIso = rows[0]?.timestamp ?? null;
  const securityEventCount = securityRows.length;
  const blockedCount = securityRows.filter(isBlockedEvent).length;
  const SCOPE: MetricScope = { window: "all", workspace: "all" };
  const highCount = securityRows.filter((row) => row.severity === "high").length;
  const mediumCount = securityRows.filter((row) => row.severity === "medium").length;
  // Build a per-metric truthful envelope so the UI renders source/observedAt/scope.
  const metrics: Record<string, MetricEnvelope<number | null>> = {
    securityEvents: metricEnvelope<number | null>({
      value: securityEventCount,
      status: securityEventCount === 0 ? "zero" : "live",
      source: "sqlite://audit_log#security-events",
      observedAt: securityRows[0]?.timestamp ?? null,
      scope: SCOPE,
      reason: securityEventCount === 0
        ? "No security-tagged audit rows in the loaded window"
        : `${securityEventCount} security-tagged audit row(s) loaded`,
    }),
    auditEvents: metricEnvelope<number | null>({
      value: rows.length,
      status: rows.length === 0 ? "zero" : "live",
      source: "sqlite://audit_log",
      observedAt: lastAuditAtIso,
      scope: SCOPE,
      reason: rows.length === 0
        ? "No audit rows in the loaded set"
        : `${rows.length} audit row(s) loaded from the last 250 events`,
    }),
    highSeverity: metricEnvelope<number | null>({
      value: highCount,
      status: highCount === 0 ? "zero" : (summaryStatus === "attention" ? "live" : "degraded"),
      source: "sqlite://audit_log",
      observedAt: securityRows[0]?.timestamp ?? null,
      scope: SCOPE,
      reason: highCount === 0
        ? "No high-severity security events"
        : `${highCount} high-severity security event(s) → summary=attention`,
    }),
    mediumSeverity: metricEnvelope<number | null>({
      value: mediumCount,
      status: mediumCount === 0 ? "zero" : (summaryStatus === "watch" ? "live" : "degraded"),
      source: "sqlite://audit_log",
      observedAt: securityRows[0]?.timestamp ?? null,
      scope: SCOPE,
      reason: mediumCount === 0
        ? "No medium-severity security events"
        : `${mediumCount} medium-severity security event(s)`,
    }),
    blockedAttempts: metricEnvelope<number | null>({
      value: blockedCount,
      status: blockedCount === 0 ? "zero" : "live",
      source: "sqlite://audit_log",
      observedAt: securityRows[0]?.timestamp ?? null,
      scope: SCOPE,
      reason: blockedCount === 0
        ? "No blocked/denied attempts detected"
        : `${blockedCount} blocked/denied attempt(s) detected`,
    }),
  };
  return {
    summary: {
      status: summaryStatus,
      securityEvents: securityEventCount,
      auditEvents: rows.length,
      highSeverity: highCount,
      mediumSeverity: mediumCount,
      blockedAttempts: blockedCount,
      lastEventAt: securityRows[0]?.timestamp ?? null,
      lastAuditAt: lastAuditAtIso,
      topActors: topActors(securityRows),
    },
    metrics,
    controls: [
      { id: "dispatch-policy", label: "Dispatch policy", status: "active" },
      { id: "a2a-policy", label: "A2A send policy", status: "active" },
      { id: "memory-write-policy", label: "Memory write policy", status: "active" },
      { id: "secret-redaction", label: "Dashboard redaction", status: "active" },
    ],
    timeline,
    auditActivity,
    timestamp: new Date().toISOString(),
  };
}
