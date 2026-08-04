import type { NextRequest } from "next/server";

import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";
import { rankMemoryPolicies, type MemoryPolicyVariant } from "@/lib/memory/policy-lab";

export const dynamic = "force-dynamic";

/**
 * POST /api/memory/policy-lab
 * Runs a deterministic policy lab ranking of N memory policy variants
 * against a golden set and returns a ranked W-table.
 *
 * Body: {
 *   variants: Array<{ name: string; config: Record<string, unknown> }>;
 *   goldenSetId?: string;
 * }
 *
 * goldenSetId defaults to the default golden set from eval config.
 * Requires operator authentication.
 */
export async function POST(req: NextRequest) {
  if (!authorizeRegistryWrite(req)) {
    return registryWriteUnauthorizedResponse();
  }

  const body = (await req.json().catch(() => null)) as {
    variants?: unknown;
    goldenSetId?: unknown;
  } | null;

  if (!body || !Array.isArray(body.variants)) {
    return Response.json({ error: "variants array is required" }, { status: 400 });
  }

  // Validate variant shape.
  const rawVariants = body.variants as unknown[];
  const variants: MemoryPolicyVariant[] = [];
  for (const v of rawVariants) {
    if (
      !v ||
      typeof v !== "object" ||
      typeof (v as Record<string, unknown>).name !== "string" ||
      typeof (v as Record<string, unknown>).config !== "object" ||
      (v as Record<string, unknown>).config === null
    ) {
      return Response.json(
        { error: "Each variant must have name (string) and config (object)" },
        { status: 400 }
      );
    }
    variants.push({
      name: (v as Record<string, unknown>).name as string,
      config: (v as Record<string, unknown>).config as Record<string, unknown>,
    });
  }

  if (variants.length === 0) {
    return Response.json({ error: "variants array must not be empty" }, { status: 400 });
  }

  const goldenSetId =
    typeof body.goldenSetId === "string" && body.goldenSetId.trim() !== ""
      ? body.goldenSetId.trim()
      : "./golden-sets/business-ops-50.jsonl";

  try {
    const ranked = await rankMemoryPolicies(variants, goldenSetId);
    return Response.json({
      ok: true,
      goldenSetId,
      ranked,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Policy lab ranking failed" },
      { status: 500 }
    );
  }
}
