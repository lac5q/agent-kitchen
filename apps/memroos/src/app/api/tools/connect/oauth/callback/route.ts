import { NextRequest } from "next/server";
import { z } from "zod";

import { authenticateUser } from "@/lib/auth/session";
import { appendActivityEvent, storeOAuthConnection } from "@/lib/tool-auth/credential-store";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  providerKey: z.string().min(1).max(64),
  nangoConnectionId: z.string().min(1).max(256).optional(),
  connectionId: z.string().min(1).max(256).optional(),
  accountEmail: z.string().email().nullable().optional(),
  scopes: z.array(z.string().max(256)).nullable().optional(),
}).refine((body) => Boolean(body.nangoConnectionId ?? body.connectionId), {
  message: "nangoConnectionId is required",
  path: ["nangoConnectionId"],
});

/** Materialize the Nango connection under the authenticated memroos owner. */
export async function POST(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) {
    return Response.json({ error: "authentication required" }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(
        { error: "invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const nangoConnectionId = body.nangoConnectionId ?? body.connectionId;
  if (!nangoConnectionId) {
    return Response.json({ error: "nangoConnectionId is required" }, { status: 400 });
  }

  try {
    const connection = await storeOAuthConnection({
      providerKey: body.providerKey,
      nangoConnectionId,
      accountEmail: body.accountEmail ?? null,
      scopes: body.scopes ?? null,
      ownerId: session.userId,
    });
    appendActivityEvent({
      providerKey: body.providerKey,
      type: "connection_established",
      connectionId: connection.connectionId,
      operatorId: session.userId,
      message: "OAuth flow completed",
    });
    return Response.json({
      providerKey: connection.providerKey,
      connectionId: connection.connectionId,
      nangoConnectionId: connection.nangoConnectionId,
    });
  } catch (err) {
    appendActivityEvent({
      providerKey: body.providerKey,
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
