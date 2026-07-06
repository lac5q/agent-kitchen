/**
 * Phase 64: TypeScript interfaces for the unified audit log and HIL escalation system.
 */

import type { AuditEventType, EntityType, ActorRole } from "./event-types";

/**
 * A stored audit entry — includes generated fields (id, created_at).
 */
export interface AuditEntry {
  id: string;
  tenant_id: string;
  actor_id: string;
  actor_role: ActorRole;
  event_type: AuditEventType;
  entity_type: EntityType;
  entity_id: string;
  reason?: string | null;
  metadata_json: string;
  created_at: string;
}

/**
 * Input for creating a new audit entry — id and created_at are generated on write.
 */
export interface NewAuditEntry {
  id?: string;
  tenant_id?: string;
  actor_id: string;
  actor_role: ActorRole;
  event_type: AuditEventType;
  entity_type: EntityType;
  entity_id: string;
  reason?: string | null;
  metadata_json?: string | Record<string, unknown>;
  created_at?: string;
}

/**
 * A stored HIL escalation record.
 */
export interface HilEscalation {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  escalation_type: "agent_escalate" | "seal_approval" | "eval_below_threshold";
  sla_seconds: number;
  sla_deadline: string;
  status: "open" | "resolved" | "sla_breached";
  assigned_to?: string | null;
  opened_by: string;
  resolved_by?: string | null;
  resolution_note?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

/**
 * Input for creating a new HIL escalation — id, sla_deadline, status, created_at are generated.
 */
export interface NewHilEscalation {
  id?: string;
  tenant_id?: string;
  entity_type: string;
  entity_id: string;
  escalation_type: "agent_escalate" | "seal_approval" | "eval_below_threshold";
  assigned_to?: string | null;
  opened_by: string;
}

/**
 * Filter parameters for querying audit entries.
 */
export interface AuditQueryFilter {
  agentId?: string;
  eventType?: AuditEventType | AuditEventType[];
  actorId?: string;
  tenantId?: string;
  /**
   * Match entries whose metadata_json contains `userId` (or `user_id`) equal
   * to this value. Used for DSAR / SIEM queries ("show everything user X wrote").
   * Phase 125, ENTOPS-03.
   */
  userId?: string;
  entityType?: EntityType;
  entityId?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}
