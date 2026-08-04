import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { writeAuditLogFromEntry as writeAuditLog } from "@/lib/store/audit";
import { recordEfficiencyEvent } from "@/lib/efficiency-telemetry";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";
import { ingestPlatformMessageMemory } from "@/lib/message-memory";

export const dynamic = "force-dynamic";

/**
 * POST /api/operations/telemetry
 *
 * Operator-authenticated bootstrap for durable NOC telemetry on hosts where
 * Claude JSONL / local session ingest is unavailable (e.g. Heroku).
 *
 * Auth: human JWT (proxy) + x-memroos-operator-key (authorizeRegistryWrite).
 * Do not send Authorization: Bearer <operator-key> — the proxy treats Bearer as JWT.
 */
export async function POST(req: NextRequest) {
  if (!authorizeRegistryWrite(req)) return registryWriteUnauthorizedResponse();

  const body = (await req.json().catch(() => null)) as {
    messages?: Array<{ content: string; agentId?: string; channelId?: string }>;
    tokenLedgers?: Array<{
      modelId: string;
      rawContextTokens: number;
      cachedTokens: number;
      totalTokens: number;
      agentId?: string;
      taskId?: string;
    }>;
    purpose?: string;
  } | null;

  if (!body || (typeof body !== "object")) {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const purpose = typeof body.purpose === "string" && body.purpose.trim()
    ? body.purpose.trim().slice(0, 120)
    : "operator-telemetry";
  const db = getDb();
  const now = new Date().toISOString();
  let messagesCreated = 0;
  let ledgersCreated = 0;

  for (const message of body.messages ?? []) {
    if (!message || typeof message.content !== "string" || !message.content.trim()) continue;
    const agentId =
      typeof message.agentId === "string" && message.agentId.trim()
        ? message.agentId.trim()
        : "operator";
    const channelId =
      typeof message.channelId === "string" && message.channelId.trim()
        ? message.channelId.trim()
        : `noc-${purpose}`;
    const result = ingestPlatformMessageMemory(db, {
      provider: "operator",
      workspaceId: "memroos",
      channelId,
      messageId: `telemetry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content: message.content.trim().slice(0, 4000),
      timestamp: now,
      author: { id: agentId, displayName: agentId, isBot: false },
      project: "operator-telemetry",
      visibility: "internal",
      policy: "indexable",
      metadata: { purpose, source: "POST /api/operations/telemetry" },
    });
    if (result.created) messagesCreated += 1;
  }

  for (const ledger of body.tokenLedgers ?? []) {
    if (!ledger || typeof ledger.modelId !== "string" || !ledger.modelId.trim()) continue;
    const raw = Number(ledger.rawContextTokens) || 0;
    const cached = Number(ledger.cachedTokens) || 0;
    const total = Number(ledger.totalTokens) || raw + cached;
    if (total <= 0 && raw <= 0 && cached <= 0) continue;
    recordEfficiencyEvent(db, {
      eventType: "token_ledger",
      taskId: ledger.taskId ?? `telemetry-${purpose}`,
      agentId: ledger.agentId ?? "operator",
      payload: {
        modelId: ledger.modelId.trim(),
        rawContextTokens: Math.max(0, raw),
        cachedTokens: Math.max(0, cached),
        totalTokens: Math.max(0, total),
      },
      createdAt: now,
    });
    ledgersCreated += 1;
  }

  writeAuditLog(db, {
    actor: "operator",
    action: "operations_telemetry_write",
    target: "noc",
    detail: JSON.stringify({ purpose, messagesCreated, ledgersCreated }),
    severity: "info",
  });

  return Response.json({
    ok: true,
    purpose,
    messagesCreated,
    ledgersCreated,
    timestamp: now,
  });
}
