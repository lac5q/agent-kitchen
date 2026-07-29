// apps/memroos/src/app/api/tools/providers/route.ts
// GET /api/tools/providers — list all providers in the registry.
// Phase 179 / v8.23.

import { NextRequest } from "next/server";
import { authenticateUser } from "@/lib/auth/session";
import {
  getCategories,
  getProvidersByCategory,
  isApiKeyProvider,
  isOAuthProvider,
} from "@/lib/tool-auth/providers";
import { listNangoIntegrationKeys } from "@/lib/tool-auth/nango-client";
import type { ListProvidersResponse } from "@/lib/tool-auth/types";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  // Availability is a live fact about the Nango workspace, not a property of
  // the catalog. Resolving it here keeps the two from drifting: Gmail sat
  // configured in Nango with no way to reach it, while Google Calendar kept
  // offering a Connect button after its integration stopped working.
  //
  // Null means "could not determine" (Nango unset or unreachable) and we fail
  // OPEN — blanking every card because Nango had a bad minute is worse than
  // showing a button that might error.
  const nangoKeys = await listNangoIntegrationKeys();

  const reasonFor = (p: ReturnType<typeof getProvidersByCategory>[number]): string | null => {
    if (!isOAuthProvider(p)) return null;
    // A statically-known blocker (e.g. a deleted upstream OAuth client) is
    // more specific than "not configured", so it wins.
    if (p.unavailableReason) return p.unavailableReason;
    if (nangoKeys && !nangoKeys.has(p.providerConfigKey)) {
      return `Not configured in Nango — add the "${p.providerConfigKey}" integration to enable it.`;
    }
    return null;
  };

  // /api/tools/providers is a public directory of available providers; the
  // catalog is the same for every installation. Per-user state (connections,
  // activity) lives behind the auth-gated sibling routes. This also lets
  // the redeploy script smoke-test the route without authenticating.
  const response: ListProvidersResponse = {
    categories: getCategories().map((cat) => ({
      id: cat.id,
      label: cat.label,
      description: cat.description,
      providers: getProvidersByCategory(cat.id).map((p) => ({
        key: p.key,
        label: p.label,
        description: p.description,
        authMode: isOAuthProvider(p) ? "oauth" : isApiKeyProvider(p) ? "api-key" : "oauth",
        // Non-null when the integration exists but cannot connect yet, so the
        // UI can disable the card with a reason instead of surfacing a raw
        // Nango error after the user clicks.
        unavailableReason: reasonFor(p),
      })),
    })),
  };
  return Response.json(response);
}
