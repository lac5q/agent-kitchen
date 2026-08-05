import crypto from "crypto";
import type Database from "better-sqlite3";

import { writeAuditEntry } from "@/lib/audit/write";
import {
  assertGovernance,
  recordGovernedWrite,
  type GovernanceContext,
} from "@/lib/store/governance";

export type AgentIssueReporterKind = "agent_key" | "oauth" | "onboarding-script";
export type AgentIssueSeverity = "low" | "medium" | "high" | "critical";
export type AgentIssueStatus = "open" | "acked" | "resolved";

export interface AgentIssueReport {
  id: string;
  reporterKind: AgentIssueReporterKind;
  reporterId: string;
  agentId: string | null;
  severity: AgentIssueSeverity;
  component: string;
  title: string;
  body: string;
  status: AgentIssueStatus;
  createdAt: string;
  ackedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface CreateAgentIssueReportInput {
  reporterKind: AgentIssueReporterKind;
  reporterId: string;
  agentId?: string | null;
  severity: AgentIssueSeverity;
  component: string;
  title: string;
  body: string;
}

export interface AgentIssueFilters {
  status?: AgentIssueStatus;
  severity?: AgentIssueSeverity;
  component?: string;
  limit?: number;
}

export class AgentIssueTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentIssueTransitionError";
  }
}

type AgentIssueRow = {
  id: string;
  reporter_kind: AgentIssueReporterKind;
  reporter_id: string;
  agent_id: string | null;
  severity: AgentIssueSeverity;
  component: string;
  title: string;
  body: string;
  status: AgentIssueStatus;
  created_at: string;
  acked_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
};

function rowToReport(row: AgentIssueRow): AgentIssueReport {
  return {
    id: row.id,
    reporterKind: row.reporter_kind,
    reporterId: row.reporter_id,
    agentId: row.agent_id,
    severity: row.severity,
    component: row.component,
    title: row.title,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    ackedAt: row.acked_at,
    resolvedAt: row.resolved_at,
    resolutionNote: row.resolution_note,
  };
}

export function getAgentIssueReport(
  db: Database.Database,
  id: string,
): AgentIssueReport | null {
  const row = db
    .prepare(
      `SELECT id, reporter_kind, reporter_id, agent_id, severity, component,
              title, body, status, created_at, acked_at, resolved_at, resolution_note
       FROM agent_issue_reports
       WHERE id = ?`,
    )
    .get(id) as AgentIssueRow | undefined;
  return row ? rowToReport(row) : null;
}

export function listAgentIssueReports(
  db: Database.Database,
  filters: AgentIssueFilters = {},
): AgentIssueReport[] {
  const clauses: string[] = [];
  const params: Record<string, string | number> = {};
  if (filters.status) {
    clauses.push("status = @status");
    params.status = filters.status;
  }
  if (filters.severity) {
    clauses.push("severity = @severity");
    params.severity = filters.severity;
  }
  if (filters.component) {
    clauses.push("component = @component");
    params.component = filters.component;
  }

  const limit = Math.min(100, Math.max(1, Math.trunc(filters.limit ?? 100)));
  params.limit = limit;
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT id, reporter_kind, reporter_id, agent_id, severity, component,
              title, body, status, created_at, acked_at, resolved_at, resolution_note
       FROM agent_issue_reports
       ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT @limit`,
    )
    .all(params) as AgentIssueRow[];
  return rows.map(rowToReport);
}

export function listOpenAgentIssueReports(
  db: Database.Database,
  limit = 100,
): AgentIssueReport[] {
  return listAgentIssueReports(db, { status: "open", limit });
}

export function createAgentIssueReport(
  db: Database.Database,
  input: CreateAgentIssueReportInput,
  governance: GovernanceContext,
): AgentIssueReport {
  assertGovernance(governance);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO agent_issue_reports
       (id, reporter_kind, reporter_id, agent_id, severity, component, title, body, created_at)
     VALUES (@id, @reporterKind, @reporterId, @agentId, @severity, @component, @title, @body, @createdAt)`,
  ).run({
    id,
    reporterKind: input.reporterKind,
    reporterId: input.reporterId,
    agentId: input.agentId ?? null,
    severity: input.severity,
    component: input.component,
    title: input.title,
    body: input.body,
    createdAt,
  });
  recordGovernedWrite(db, governance);
  const report = getAgentIssueReport(db, id);
  if (!report) throw new Error(`Failed to create agent issue report ${id}`);
  return report;
}

export function transitionAgentIssueReport(
  db: Database.Database,
  id: string,
  action: "ack" | "resolve",
  actor: { id: string; role: "admin" | "operator" },
  note: string | null,
  governance: GovernanceContext,
): AgentIssueReport {
  assertGovernance(governance);
  const existing = getAgentIssueReport(db, id);
  if (!existing) throw new AgentIssueTransitionError("agent issue report not found");
  if (action === "ack" && existing.status !== "open") {
    throw new AgentIssueTransitionError(`agent issue report is already ${existing.status}`);
  }
  if (action === "resolve" && existing.status === "resolved") {
    throw new AgentIssueTransitionError("agent issue report is already resolved");
  }

  const now = new Date().toISOString();
  const nextStatus: AgentIssueStatus = action === "ack" ? "acked" : "resolved";
  const eventType = action === "ack" ? "agent_issue.acknowledged" : "agent_issue.resolved";
  db.transaction(() => {
    if (action === "ack") {
      db.prepare(
        `UPDATE agent_issue_reports
         SET status = 'acked', acked_at = ?, resolution_note = ?
         WHERE id = ? AND status = 'open'`,
      ).run(now, note, id);
    } else {
      db.prepare(
        `UPDATE agent_issue_reports
         SET status = 'resolved', resolved_at = ?, resolution_note = ?
         WHERE id = ? AND status IN ('open', 'acked')`,
      ).run(now, note, id);
    }
    writeAuditEntry(
      {
        tenant_id: "default-tenant",
        actor_id: actor.id,
        actor_role: actor.role,
        event_type: eventType,
        entity_type: "agent_issue_report",
        entity_id: `agent_issue_report:${id}`,
        reason: note,
        metadata_json: {
          issue_id: id,
          action,
          previous_status: existing.status,
          next_status: nextStatus,
        },
        created_at: now,
      },
      db,
    );
    recordGovernedWrite(db, governance);
  })();

  const report = getAgentIssueReport(db, id);
  if (!report) throw new Error(`Agent issue report disappeared after ${action}`);
  return report;
}
