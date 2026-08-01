/**
 * Claude Cowork uses a remote custom connector (HTTPS MCP), not curl|bash.
 * Bearer stays with the operator (Team / rotate doc) — never in the invite email body.
 */

export const COWORK_PLATFORM_ID = "cowork" as const;

export function resolveCoworkMcpUrl(publicBaseUrl: string): string {
  const base = publicBaseUrl.replace(/\/+$/, "");
  return `${base}/mcp`;
}

export function isCordantPublicUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "memroos-cordant.epiloguecapital.com";
  } catch {
    return /memroos-cordant\.epiloguecapital\.com/i.test(url);
  }
}

/** Numbered connector steps shown on Invite Connect (no long-lived bearer). */
export function buildCoworkConnectorSteps(mcpUrl: string): string[] {
  return [
    `Open Claude Cowork → Settings → Connectors (or Custom connectors).`,
    `Add a custom connector with URL: ${mcpUrl}`,
    `Set Authorization to Request header: Bearer <token from your Cordant Team admin — do not paste tokens into email>.`,
    `Save, then confirm MemRoOS tools appear in the connector tools list.`,
  ];
}

/** Short deep-link style reference for docs / optional COWORK-04 path. */
export function buildCoworkDeepLinkHint(mcpUrl: string): string {
  return `Claude Cowork custom connector → ${mcpUrl}`;
}
