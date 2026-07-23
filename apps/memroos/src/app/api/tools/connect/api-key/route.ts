// apps/memroos/src/app/api/tools/connect/api-key/route.ts
// POST /api/tools/connect/api-key — store an API key for a provider.
// Phase 179 / v8.23.

import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/session";
import {
  getProvider,
  isApiKeyProvider,
} from "@/lib/tool-auth/providers";
import {
  storeApiKeyConnection,
  appendActivityEvent,
} from "@/lib/tool-auth/credential-store";
import type {
  ConnectApiKeyRequest,
  ConnectApiKeyResponse,
} from "@/lib/tool-auth/types";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  providerKey: z.string().min(1).max(64),
  credentials: z.record(z.string().min(1).max(4096)),
});

export async function POST(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) {
    return Response.json({ error: "authentication required" }, { status: 401 });
  }

  let body: ConnectApiKeyRequest;
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(
        { error: "invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    body = parsed.data as ConnectApiKeyRequest;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const provider = getProvider(body.providerKey);
  if (!provider || !isApiKeyProvider(provider)) {
    return Response.json(
      { error: "provider not found or not an API-key provider" },
      { status: 404 },
    );
  }

  // memroos's convention: API-key credentials arrive as { apiKey: "..." }.
  // Other shapes (Plaid needs { clientId, secret }) extend this by writing a
  // second secret field; we accept any non-empty string-valued field.
  const apiKey = body.credentials.apiKey ?? body.credentials.key;
  if (!apiKey || apiKey.length < 8) {
    return Response.json(
      { error: "api_key_required", message: "API key must be at least 8 characters" },
      { status: 400 },
    );
  }

  try {
    const connection = await storeApiKeyConnection({
      providerKey: provider.key,
      apiKey,
    });
    appendActivityEvent({
      providerKey: provider.key,
      type: "connection_established",
      connectionId: connection.connectionId,
      operatorId: session.userId,
      message: "API key stored in vault",
    });
    const response: ConnectApiKeyResponse = {
      providerKey: provider.key,
      connectionId: connection.connectionId,
      account: null,
    };
    return Response.json(response);
  } catch (err) {
    appendActivityEvent({
      providerKey: provider.key,
      type: "test_failed",
      operatorId: session.userId,
      message: err instanceof Error ? err.message : "vault write failed",
    });
    return Response.json(
      { error: "vault_write_failed", message: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}