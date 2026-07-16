/**
 * Phase 127 / ENTOPS-07: redact secrets from harness auto-memory content
 * before replay. Uses the existing content scanner — never returns raw
 * HIGH-severity secrets in the replay payload.
 */

import { scanContent, type ScanMatch } from "@/lib/content-scanner";

export interface NativeMemoryFilterResult {
  /** Sanitized content safe to write to local memory files. */
  sanitized: string;
  /** True when HIGH-severity matches were redacted. */
  redacted: boolean;
  matches: ScanMatch[];
  /** Original length (for telemetry; content itself is not retained). */
  originalLength: number;
}

/**
 * Filter native-memory content for secrets/PII before replay.
 * Always returns scanner cleanContent — never the raw input when HIGH matches exist.
 */
export function filterNativeMemory(content: string): NativeMemoryFilterResult {
  const text = content == null ? "" : String(content);
  const scan = scanContent(text);
  const hasHigh = scan.matches.some((m) => m.severity === "HIGH");
  return {
    // Prefer cleanContent always so replay never carries raw HIGH secrets.
    sanitized: scan.cleanContent,
    redacted: hasHigh || scan.blocked,
    matches: scan.matches,
    originalLength: text.length,
  };
}
