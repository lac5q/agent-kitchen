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
 * The connector must point at the deployment that issued the invite.
 *
 * This previously always returned Cordant, so that an oracle-1 invite would
 * still show Cordant's `/mcp` in Eric-path screenshots. That is wrong, and it
 * locked a real user out: accounts are per-deployment, so someone who accepted
 * an invite on `memroos.epiloguecapital.com` has no account on
 * `memroos-cordant.epiloguecapital.com`. Claude Cowork then ran the OAuth
 * round-trip against Cordant, which correctly refused an unknown identity with
 * `google_invite_required` — leaving the user with a connector they could not
 * complete and a login they could not pass.
 *
 * Same-origin is the only default that cannot produce that state. An operator
 * who genuinely wants to cross hosts still can, explicitly, via
 * NEXT_PUBLIC_COWORK_MCP_URL. Never invent tokens into the URL.
 */
export function resolvePreferredCoworkMcpUrl(pageOrigin: string): string {
  const pinned =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_COWORK_MCP_URL?.trim()
      : undefined;
  if (pinned) {
    return pinned.endsWith("/mcp") ? pinned.replace(/\/+$/, "") : resolveCoworkMcpUrl(pinned);
  }
  return resolveCoworkMcpUrl(pageOrigin);
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
      `Set Request header Authorization to Bearer <token from hermes ~/.memroos/memroos-mcp-http.env> (admin only — never email this).`,
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
