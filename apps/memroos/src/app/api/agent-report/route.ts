import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { resolveAccessToken } from "@/lib/auth/mcp-oauth-store";
import { authenticateUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/middleware-roles";
import { checkScopedRateLimit, getRateLimitIp } from "@/lib/auth/rate-limit";
import { getDb } from "@/lib/db";
import {
  createAgentIssueReport,
  listAgentIssueReports,
  type AgentIssueReporterKind,
  type AgentIssueSeverity,
  type AgentIssueStatus,
} from "@/lib/store/agent-issues";

export const dynamic = "force-dynamic";

const TITLE_MAX_LENGTH = 200;
const BODY_MAX_LENGTH = 8000;
const COMPONENT_MAX_LENGTH = 100;
const REPORT_RATE_LIMIT = 5;
const REPORT_RATE_WINDOW_MS = 60 * 60 * 1000;
const ONBOARDING_RATE_LIMIT = 3;
const ONBOARDING_RATE_WINDOW_MS = 60 * 60 * 1000;
const SECRET_ERROR = "report contains credential-shaped content — strip secrets and resend";
const SECRET_PATTERNS = [
  /ak_[A-Za-z0-9_-]{20,}/,
  /\bSG\.[A-Za-z0-9._-]{10,}/,
  /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/i,
  /\b[a-f0-9]{64}\b/,
];
const SEVERITIES: AgentIssueSeverity[] = ["low", "medium", "high", "critical"];
const STATUSES: AgentIssueStatus[] = ["open", "acked", "resolved"];

type ReportPrincipal = {
  reporterKind: AgentIssueReporterKind;
  reporterId: string;
  agentId: string | null;
  role: "admin" | "operator" | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function containsSecretShapedContent(...values: string[]): boolean {
  return SECRET_PATTERNS.some((pattern) => values.some((value) => pattern.test(value)));
}

function governanceFor(principal: ReportPrincipal, severity: AgentIssueSeverity) {
  return {
    actor: principal.reporterId,
    action: "agent_issue_reports.create",
    asset: "agent_issue_reports",
    purpose: "report a problem with MemroOS",
    label: {
      visibility: "private" as const,
      domain: "agent-issue-report",
      sensitivity: severity === "low" ? "medium" as const : "high" as const,
      policy: "agent-report",
    },
    decision: "allow" as const,
  };
}

async function authenticateReportPrincipal(
  request: Request,
  agentIdHint?: string,
): Promise<ReportPrincipal | null> {
  const agent = authenticateAgentHeaders(request.headers, agentIdHint);
  if (agent) {
    return {
      reporterKind: "agent_key",
      reporterId: agent.id,
      agentId: agent.id,
      role: null,
    };
  }

  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) {
    try {
      const oauth = resolveAccessToken(bearer);
      if (oauth) {
        return {
          reporterKind: "oauth",
          reporterId: oauth.userId,
          agentId: oauth.agentId,
          role: null,
        };
      }
    } catch {
      // Fall through to the operator session path. Invalid MCP tokens never
      // grant access, while a valid browser session may still be present.
    }
  }

  const session = await authenticateUser(request);
  if (!session) return null;
  const roleError = requireRole(session.role, "operator");
  if (roleError) return null;
  return {
    reporterKind: "oauth",
    reporterId: session.userId,
    agentId: null,
    role: session.role === "admin" ? "admin" : "operator",
  };
}

function onboardingPrincipal(request: Request, body: Record<string, unknown>): ReportPrincipal | null {
  if (request.headers.get("authorization")) return null;
  if (body.component !== "onboarding") return null;
  const tokenKid = body.tokenKid;
  if (typeof tokenKid !== "string" || !/^[0-9a-f]{8}$/i.test(tokenKid)) return null;
  return {
    reporterKind: "onboarding-script",
    reporterId: `onboarding:${tokenKid.toLowerCase()}`,
    agentId: stringValue(body.agentId),
    role: null,
  };
}

function parseReportBody(body: Record<string, unknown>): {
  title: string;
  content: string;
  component: string;
  severity: AgentIssueSeverity;
  agentId: string | null;
  tokenKid: string | null;
} | { error: Response } {
  const title = stringValue(body.title)?.trim() ?? "";
  const content = stringValue(body.body) ?? "";
  const component = (stringValue(body.component)?.trim() || "general");
  const severityValue = stringValue(body.severity)?.trim() || "medium";
  const severity = SEVERITIES.includes(severityValue as AgentIssueSeverity)
    ? severityValue as AgentIssueSeverity
    : null;
  const agentId = stringValue(body.agentId)?.trim() || null;
  const tokenKid = stringValue(body.tokenKid)?.trim() || null;

  if (!title || !content) {
    return { error: Response.json({ ok: false, error: "title and body are required" }, { status: 400 }) };
  }
  if (title.length > TITLE_MAX_LENGTH || content.length > BODY_MAX_LENGTH) {
    return {
      error: Response.json(
        { ok: false, error: `title must be <= ${TITLE_MAX_LENGTH} characters and body <= ${BODY_MAX_LENGTH} characters` },
        { status: 400 },
      ),
    };
  }
  if (component.length > COMPONENT_MAX_LENGTH) {
    return { error: Response.json({ ok: false, error: "component is too long" }, { status: 400 }) };
  }
  if (!severity) {
    return { error: Response.json({ ok: false, error: "invalid severity" }, { status: 400 }) };
  }
  if (containsSecretShapedContent(title, content)) {
    return { error: Response.json({ ok: false, error: SECRET_ERROR }, { status: 422 }) };
  }
  return { title, content, component, severity, agentId, tokenKid };
}

export async function POST(request: NextRequest) {
  // Authenticate a supplied credential before parsing the body so a valid
  // principal can be rate-limited at the cheapest point. Requests without a
  // usable credential use the onboarding/IP bucket before any body work.
  const hasCredential = Boolean(request.headers.get("authorization") || request.headers.get("cookie"));
  const preAuthPrincipal = hasCredential ? await authenticateReportPrincipal(request) : null;
  const rateLimit = checkScopedRateLimit(
    request,
    "agent-report",
    preAuthPrincipal
      ? `${preAuthPrincipal.reporterKind}:${preAuthPrincipal.reporterId}`
      : `ip:${getRateLimitIp(request)}`,
    preAuthPrincipal ? REPORT_RATE_LIMIT : ONBOARDING_RATE_LIMIT,
    preAuthPrincipal ? REPORT_RATE_WINDOW_MS : ONBOARDING_RATE_WINDOW_MS,
  );
  if (rateLimit) return rateLimit;

  const body = (await request.json().catch(() => null)) as unknown;
  if (!isRecord(body)) {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = parseReportBody(body);
  if ("error" in parsed) return parsed.error;

  const onboarding = onboardingPrincipal(request, body);
  const principal = onboarding ?? await authenticateReportPrincipal(request, parsed.agentId ?? undefined);
  if (!principal) {
    return Response.json({ ok: false, error: "authentication required" }, { status: 401 });
  }

  if (onboarding) {
    parsed.severity = "high";
    parsed.component = "onboarding";
  }

  const db = getDb();
  const report = createAgentIssueReport(
    db,
    {
      reporterKind: principal.reporterKind,
      reporterId: principal.reporterId,
      agentId: principal.agentId ?? parsed.agentId,
      severity: parsed.severity,
      component: parsed.component,
      title: parsed.title,
      body: parsed.content,
    },
    governanceFor(principal, parsed.severity),
  );
  return Response.json({ ok: true, report }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const session = await authenticateUser(request);
  if (!session) return Response.json({ ok: false, error: "authentication required" }, { status: 401 });
  const roleError = requireRole(session.role, "operator");
  if (roleError) return roleError;

  const params = (request.nextUrl ?? new URL(request.url)).searchParams;
  const rawStatus = params.get("status");
  const status = rawStatus === "all" || (rawStatus && STATUSES.includes(rawStatus as AgentIssueStatus))
    ? rawStatus === "all" ? undefined : rawStatus as AgentIssueStatus
    : rawStatus ? null : "open" as AgentIssueStatus;
  if (status === null) return Response.json({ ok: false, error: "invalid status" }, { status: 400 });

  const rawSeverity = params.get("severity");
  const severity = rawSeverity && SEVERITIES.includes(rawSeverity as AgentIssueSeverity)
    ? rawSeverity as AgentIssueSeverity
    : rawSeverity ? null : undefined;
  if (severity === null) return Response.json({ ok: false, error: "invalid severity" }, { status: 400 });

  const component = params.get("component")?.trim() || undefined;
  const requestedLimit = Number(params.get("limit") ?? "100");
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.trunc(requestedLimit))) : 100;
  const reports = listAgentIssueReports(getDb(), { status, severity, component, limit });
  return Response.json({ ok: true, reports, count: reports.length });
}
