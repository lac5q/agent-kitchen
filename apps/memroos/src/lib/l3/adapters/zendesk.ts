/**
 * @fixture
 * Phase 61 — Zendesk Helpdesk adapter (fixture only, v2 deferred).
 *
 * Returns representative BusinessOutcomeEvent fixture data.
 *
 * INTENTIONAL_STUB: retained as a non-production L3 fixture until the live
 * Zendesk integration is implemented.
 *
 * PRODUCTION GUARD: throws if process.env.NODE_ENV === "production".
 */

import type { BusinessSystemAdapter } from "../adapter-interface";
import type { BusinessOutcomeEvent } from "../types";

export function createZendeskAdapter(): BusinessSystemAdapter {
  return {
    name: "zendesk",
    category: "helpdesk",
    async poll(since: Date): Promise<BusinessOutcomeEvent[]> {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "[zendesk] Fixture adapter must not run in production. " +
            "Deploy the live Zendesk adapter in Phase 62."
        );
      }

      const polledAt = since.toISOString();
      return [
        {
          tenantId: "default-tenant",
          correlationId: "fixture-zendesk-001",
          sourceSystem: "helpdesk",
          adapter: "zendesk",
          eventType: "ticket_solved",
          kpiKey: "completion_rate",
          kpiValue: 1,
          rawJson: JSON.stringify({
            ticketId: "TKT-001",
            status: "solved",
            correlationId: "fixture-zendesk-001",
          }),
          polledAt,
        },
        {
          tenantId: "default-tenant",
          correlationId: "fixture-zendesk-001",
          sourceSystem: "helpdesk",
          adapter: "zendesk",
          eventType: "csat_rating",
          kpiKey: "approval_rate",
          kpiValue: 1,
          rawJson: JSON.stringify({
            ticketId: "TKT-001",
            satisfactionRating: "good",
            correlationId: "fixture-zendesk-001",
          }),
          polledAt,
        },
        {
          tenantId: "default-tenant",
          correlationId: "fixture-zendesk-001",
          sourceSystem: "helpdesk",
          adapter: "zendesk",
          eventType: "escalation",
          kpiKey: "escalation_rate",
          kpiValue: 0,
          rawJson: JSON.stringify({
            ticketId: "TKT-001",
            escalated: false,
            correlationId: "fixture-zendesk-001",
          }),
          polledAt,
        },
      ];
    },
  };
}
