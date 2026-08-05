import type Database from "better-sqlite3";
import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";
import { writeAuditEntry } from "@/lib/audit/write";
import { getDb } from "@/lib/db";
import type { PublicMemroosUrlResolution } from "@/lib/http/public-base-url";

/**
 * Emit the NOC-visible audit receipt for production minting that had to use
 * request headers instead of a configured public base URL. Data access lives
 * here in `lib/store/**` (STORE-03 chokepoint); `public-base-url.ts` stays a
 * pure resolver with no database import.
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
