// Bounded SourceStatus enum for meeting source-to-index evidence chain.
//
// Mirror of services/knowledge-mcp/knowledge_system/source_status.py.
// Both languages MUST agree on the literal strings so the operator console
// renders the same vocabulary as the knowledge MCP server produces.
//
// Pipeline order:
//   provider_absent      -> no provider is configured for this meeting source
//   provider_auth_blocked-> provider exists but OAuth / scopes are insufficient
//   captured_unrouted    -> raw capture exists in vault but no routing decision
//   routed_unindexed     -> routed to a target collection but no QMD index yet
//   indexed_unrecalled   -> QMD indexed content but memory_recall returns nothing
//   recalled             -> happy path: recall returns the indexed content
//
// Only `recalled` is terminal; anything else is a stop-the-line signal for
// operators triaging why a meeting lookup failed.

export const SOURCE_STATUS = {
  providerAbsent: "provider_absent",
  providerAuthBlocked: "provider_auth_blocked",
  capturedUnrouted: "captured_unrouted",
  routedUnindexed: "routed_unindexed",
  indexedUnrecalled: "indexed_unrecalled",
  recalled: "recalled",
} as const;

export type SourceStatus =
  (typeof SOURCE_STATUS)[keyof typeof SOURCE_STATUS];

export const SOURCE_STATUS_VALUES: readonly SourceStatus[] = [
  SOURCE_STATUS.providerAbsent,
  SOURCE_STATUS.providerAuthBlocked,
  SOURCE_STATUS.capturedUnrouted,
  SOURCE_STATUS.routedUnindexed,
  SOURCE_STATUS.indexedUnrecalled,
  SOURCE_STATUS.recalled,
];

export function isSourceStatus(value: unknown): value is SourceStatus {
  return typeof value === "string" && (SOURCE_STATUS_VALUES as readonly string[]).includes(value);
}

export function coerceSourceStatus(value: unknown): SourceStatus {
  if (typeof value !== "string") {
    return SOURCE_STATUS.providerAbsent;
  }
  const needle = value.trim().toLowerCase();
  if ((SOURCE_STATUS_VALUES as readonly string[]).includes(needle)) {
    return needle as SourceStatus;
  }
  return SOURCE_STATUS.providerAbsent;
}

export function isTerminalSourceStatus(status: SourceStatus): boolean {
  return status === SOURCE_STATUS.recalled;
}

export interface MeetingSourceStatus {
  collection: string;
  status: SourceStatus;
  count: number;
  lastIndexAt: string | null;
  reason?: string;
  repairHint?: string;
}
