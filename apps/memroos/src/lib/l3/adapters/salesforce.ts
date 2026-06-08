/**
 * @fixture
 * Phase 61 — Salesforce CRM adapter (fixture only, v2 deferred).
 *
 * Returns representative BusinessOutcomeEvent fixture data.  This adapter is
 * deliberately excluded from production adapter discovery.
 *
 * INTENTIONAL_STUB: retained as a non-production L3 fixture until the live
 * Salesforce integration is implemented.
 *
 * PRODUCTION GUARD: throws if process.env.NODE_ENV === "production".
 */

import type { BusinessSystemAdapter } from "../adapter-interface";
import type { BusinessOutcomeEvent } from "../types";

export function createSalesforceAdapter(): BusinessSystemAdapter {
  return {
    name: "salesforce",
    category: "crm",
    async poll(since: Date): Promise<BusinessOutcomeEvent[]> {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "[salesforce] Fixture adapter must not run in production. " +
            "Deploy the live Salesforce adapter in Phase 62."
        );
      }

      const polledAt = since.toISOString();
      return [
        {
          tenantId: "default-tenant",
          correlationId: "fixture-sfdc-001",
          sourceSystem: "crm",
          adapter: "salesforce",
          eventType: "opportunity_closed",
          kpiKey: "completion_rate",
          kpiValue: 1,
          rawJson: JSON.stringify({
            opportunityId: "OPP-001",
            stageName: "Closed Won",
            correlationId: "fixture-sfdc-001",
          }),
          polledAt,
        },
        {
          tenantId: "default-tenant",
          correlationId: "fixture-sfdc-001",
          sourceSystem: "crm",
          adapter: "salesforce",
          eventType: "lead_converted",
          kpiKey: "approval_rate",
          kpiValue: 1,
          rawJson: JSON.stringify({
            leadId: "LEAD-001",
            isConverted: true,
            correlationId: "fixture-sfdc-001",
          }),
          polledAt,
        },
      ];
    },
  };
}
