import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { authenticateUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/middleware-roles";
import { streamAuditEntries } from "@/lib/audit/query";
import type { AuditQueryFilter } from "@/lib/audit/schema";
import type { AuditEventType } from "@/lib/audit/event-types";
import type { AuditEntry } from "@/lib/audit/schema";

export const dynamic = "force-dynamic";

const CSV_HEADERS = [
  "id",
  "tenant_id",
  "actor_id",
  "actor_role",
  "event_type",
  "entity_type",
  "entity_id",
  "reason",
  "metadata_json",
  "created_at",
] as const satisfies (keyof AuditEntry)[];

function csvEscape(value: string | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function entryToCsvRow(entry: AuditEntry): string {
  return CSV_HEADERS.map((key) => csvEscape(entry[key] as string | null | undefined)).join(",");
}

/**
 * GET /api/audit/export
 *
 * Streams all audit entries matching the filter in NDJSON or CSV format.
 * Accessible by operator and admin only (reviewer cannot bulk-export).
 *
 * Query params: same as /api/audit, plus format=ndjson|csv (default: ndjson)
 */
export async function GET(req: NextRequest) {
  const session = await authenticateUser(req);
  const roleError = requireRole(session?.role, "operator");
  if (roleError) return roleError;
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });

  const url = req.nextUrl ?? new URL(req.url);
  const sp = url.searchParams;
  const format = sp.get("format") === "csv" ? "csv" : "ndjson";

  const filter: AuditQueryFilter = {
    agentId: sp.get("agentId") ?? undefined,
    eventType: (sp.get("eventType") ?? undefined) as AuditEventType | undefined,
    actorId: sp.get("actorId") ?? undefined,
    tenantId: sp.get("tenantId") ?? session.tenantId,
    // Phase 125, ENTOPS-03: DSAR / SIEM — one query for "everything user X wrote".
    userId: sp.get("userId") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  };

  const rawEventType = sp.get("eventType");
  if (rawEventType && rawEventType.includes(",")) {
    filter.eventType = rawEventType.split(",").map((s) => s.trim()) as AuditEventType[];
  }

  const db = getDb();

  const enc = new TextEncoder();

  if (format === "csv") {
    const iterator = streamAuditEntries(filter, db);
    const stream = new ReadableStream({
      start(controller) {
        try {
          controller.enqueue(enc.encode(CSV_HEADERS.join(",") + "\n"));
          for (const entry of iterator) {
            controller.enqueue(enc.encode(entryToCsvRow(entry) + "\n"));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  // NDJSON format
  const iterator = streamAuditEntries(filter, db);
  const stream = new ReadableStream({
    start(controller) {
      try {
        for (const entry of iterator) {
          controller.enqueue(enc.encode(JSON.stringify(entry) + "\n"));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Content-Disposition": `attachment; filename="audit-export-${new Date().toISOString().slice(0, 10)}.ndjson"`,
    },
  });
}
