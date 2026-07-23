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
import type { ListProvidersResponse } from "@/lib/tool-auth/types";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
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
      })),
    })),
  };
  return Response.json(response);
}