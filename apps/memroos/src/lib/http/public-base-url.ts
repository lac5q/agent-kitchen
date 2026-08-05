import type Database from "better-sqlite3";
import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";
import { writeAuditEntry } from "@/lib/audit/write";
import { getDb } from "@/lib/db";

export type PublicMemroosUrlSource = "env" | "forwarded-host" | "request-origin";

export interface PublicMemroosUrlResolution {
  url: string;
  source: PublicMemroosUrlSource;
}

function isLocalhostUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return true;
  }
}

function stripTrailingSlash(raw: string): string {
  return raw.replace(/\/+$/, "");
}

/**
 * Resolve a non-localhost MemRoOS base URL for minted invite/onboarding links.
 * Prefers configured public env, then forwarded host, then request origin.
 */
export function resolvePublicMemroosUrlDetailed(request: Request): PublicMemroosUrlResolution {
  const candidates = [
    process.env.MEMROOS_PUBLIC_BASE_URL,
    process.env.MEMROOS_APP_URL,
    process.env.MEMROOS_BASE_URL,
  ];
  for (const candidate of candidates) {
    if (candidate && !isLocalhostUrl(candidate)) {
      return { url: stripTrailingSlash(candidate), source: "env" };
    }
  }

  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedHost) {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return { url: stripTrailingSlash(`${proto}://${forwardedHost}`), source: "forwarded-host" };
  }

  return { url: stripTrailingSlash(`${url.protocol}//${url.host}`), source: "request-origin" };
}

export function resolvePublicMemroosUrl(request: Request): string {
  return resolvePublicMemroosUrlDetailed(request).url;
}

/**
 * Emit the NOC-visible audit receipt for production minting that had to use
 * request headers instead of a configured public base URL.
 */
export function recordOnboardingBaseUrlFallback(
  resolution: PublicMemroosUrlResolution,
  db?: Database.Database
): void {
  if (process.env.NODE_ENV !== "production" || resolution.source === "env") return;

  let fallbackHost = resolution.url;
  try {
    fallbackHost = new URL(resolution.url).host;
  } catch {
    fallbackHost =
      resolution.url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split("/")[0] || resolution.url;
  }

  try {
    writeAuditEntry(
      {
        tenant_id: "default-tenant",
        actor_id: "system:onboarding",
        actor_role: "system",
        event_type: AUDIT_EVENT_TYPES.ONBOARDING_BASE_URL_FALLBACK,
        entity_type: ENTITY_TYPES.ONBOARDING,
        entity_id: `onboarding:base-url:${fallbackHost}`,
        reason: `Onboarding mint used ${resolution.source} fallback host ${fallbackHost}`,
        metadata_json: {
          source: resolution.source,
          fallback_host: fallbackHost,
          fallback_url: resolution.url,
        },
      },
      db ?? getDb()
    );
  } catch (error) {
    // A diagnostic receipt must not turn an otherwise valid onboarding mint
    // into a 500 when the audit store is unavailable.
    console.error("[onboarding] base URL fallback audit failed:", error);
  }
}
