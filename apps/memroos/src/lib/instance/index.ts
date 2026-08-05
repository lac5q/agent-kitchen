const PUBLIC_BASE_URL_ENV_KEYS = [
  "MEMROOS_PUBLIC_BASE_URL",
  "MEMROOS_APP_URL",
  "MEMROOS_BASE_URL",
] as const;

function titleCaseFirstCharacter(value: string): string {
  return value.length > 0 ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

/**
 * Resolve the human-facing workspace name used by invite copy.
 *
 * The optional URL lets callers pass the already-resolved public origin
 * without exposing server-only configuration to the client bundle.
 */
export function resolveWorkspaceName(publicBaseUrl?: string): string {
  const configured = process.env.MEMROOS_WORKSPACE_NAME?.trim();
  if (configured) return configured;

  const configuredBaseUrl = PUBLIC_BASE_URL_ENV_KEYS.map((key) => process.env[key]?.trim()).find(Boolean);
  const candidate = publicBaseUrl?.trim() || configuredBaseUrl;

  if (candidate) {
    try {
      const firstHostnameLabel = new URL(candidate).hostname.split(".")[0];
      if (firstHostnameLabel) return titleCaseFirstCharacter(firstHostnameLabel);
    } catch {
      // Invalid configuration is handled by the mint-time URL validator.
    }
  }

  return "MemRoOS";
}
