/**
 * Compatibility facade for the legacy audit writer.
 *
 * The table operation lives in `lib/store/audit.ts`; this export keeps the
 * historical two-argument API stable for older tests and callers while the
 * store's primary write helper requires GovernanceContext.
 */

export { writeAuditLogFromEntry as writeAuditLog } from "@/lib/store/audit";
export type { AuditEntry } from "@/lib/store/audit";
