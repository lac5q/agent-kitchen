/**
 * Claude Cowork uses a remote custom connector (HTTPS MCP), not curl|bash.
 *
 * Auth model:
 * - Members never paste shared bearers — Team admin configures Claude connector
 *   request headers once (static_headers).
 * - Google OAuth (when shipped) is for MemRoOS account registration/login only,
 *   not for authenticating the Cowork → /mcp connector.
 * - See .planning/phases/203-cowork-mcp-oauth/203-CONTEXT.md
 */

export const COWORK_PLATFORM_ID = "cowork" as const;

/** Cordant brain — Eric / Cordant workers (not oracle). */
export const CORDANT_PUBLIC_ORIGIN = "https://memroos-cordant.epiloguecapital.com";

export type CoworkAudience = "member" | "admin";

export function resolveCoworkMcpUrl(publicBaseUrl: string): string {
  const base = publicBaseUrl.replace(/\/+$/, "");
  return `${base}/mcp`;
}

/**
 * Prefer Cordant for Cowork when the page origin is Cordant, or when the
 * operator pinned NEXT_PUBLIC_COWORK_MCP_URL. Never invent tokens into the URL.
 */
export function resolvePreferredCoworkMcpUrl(pageOrigin: string): string {
  const pinned =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_COWORK_MCP_URL?.trim()
      : undefined;
  if (pinned) {
    return pinned.endsWith("/mcp") ? pinned.replace(/\/+$/, "") : resolveCoworkMcpUrl(pinned);
  }
  if (isCordantPublicUrl(pageOrigin)) {
    return resolveCoworkMcpUrl(CORDANT_PUBLIC_ORIGIN);
  }
  // Oracle (or other) invite: still offer Cordant for Cowork by default so
  // Eric-path screenshots never show memroos.epiloguecapital.com/mcp by accident.
  // Operators testing oracle MCP can pin NEXT_PUBLIC_COWORK_MCP_URL.
  return resolveCoworkMcpUrl(CORDANT_PUBLIC_ORIGIN);
}

export function isCordantPublicUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "memroos-cordant.epiloguecapital.com";
  } catch {
    return /memroos-cordant\.epiloguecapital\.com/i.test(url);
  }
}

export function buildCoworkDeepLink(mcpUrl: string): string {
  const params = new URLSearchParams({
    modal: "add-custom-connector",
    connectorName: "MemRoOS",
    connectorUrl: mcpUrl,
  });
  return `https://claude.ai/customize/connectors?${params.toString()}`;
}

/**
 * Numbered connector steps. Default audience is **member** (no bearer paste).
 */
export function buildCoworkConnectorSteps(
  mcpUrl: string,
  audience: CoworkAudience = "member"
): string[] {
  const deepLink = buildCoworkDeepLink(mcpUrl);
  if (audience === "admin") {
    return [
      `Open Claude → Admin settings → Connectors → Add custom connector.`,
      `URL: ${mcpUrl}`,
      `Until Google/MCP OAuth ships: set Request header Authorization to Bearer <token from hermes ~/.memroos/memroos-mcp-http.env> (admin only — never email this).`,
      `Save. Members then only need Connectors → MemRoOS → Connect (no token).`,
    ];
  }
  return [
    `In Claude Cowork, open Connectors (or tap this setup link): ${deepLink}`,
    `If MemRoOS is already listed for your team, tap Connect — you should not need any password or token.`,
    `If it is not listed yet, ask your Cordant Team admin to add it once (they use the URL ${mcpUrl}).`,
    `After Connect, confirm MemRoOS tools appear. (Google is only for your MemRoOS account login — your admin handles the connector.)`,
  ];
}

/** Short deep-link style reference for docs / COWORK-04. */
export function buildCoworkDeepLinkHint(mcpUrl: string): string {
  return `Claude Cowork → ${buildCoworkDeepLink(mcpUrl)}`;
}
