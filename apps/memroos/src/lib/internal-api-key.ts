/**
 * Known-default rejection sentinel — intentional literal, not a real credential.
 * Used to fail-fast if this value is found at runtime.
 * nosemgrep: detected-api-key
 */
export const KNOWN_DEFAULT_INTERNAL_API_KEY = "memroos-internal-default-key";

/**
 * Asserts that the given key is not the publicly-known default value.
 *
 * Returns immediately if key is falsy (undefined or empty string) — those cases are
 * handled separately by callers with their own "required" errors.
 *
 * Throws if key equals KNOWN_DEFAULT_INTERNAL_API_KEY to fail-fast if the
 * known default credential is found at runtime (finding A01-002, SEC-05).
 */
export function assertNotDefaultInternalApiKey(key: string | undefined): void {
  if (!key) {
    // Falsy (undefined or empty) — callers own the "required" check.
    return;
  }
  if (key === KNOWN_DEFAULT_INTERNAL_API_KEY) {
    throw new Error(
      "MEMROOS_INTERNAL_API_KEY must not use the known default value " +
        "'memroos-internal-default-key'. Generate a real key: openssl rand -hex 32"
    );
  }
}
