/**
 * @fixture
 * Phase 61 — NetSuite finance adapter (fixture only, v2 deferred).
 *
 * Returns representative BusinessOutcomeEvent fixture data.
 *
 * INTENTIONAL_STUB: retained as a non-production L3 fixture until the live
 * NetSuite integration is implemented.
 *
 * PRODUCTION GUARD: throws if process.env.NODE_ENV === "production".
 */

import type { BusinessSystemAdapter } from "../adapter-interface";
import type { BusinessOutcomeEvent } from "../types";

export function createNetSuiteAdapter(): BusinessSystemAdapter {
  return {
    name: "netsuite",
    category: "finance",
    async poll(since: Date): Promise<BusinessOutcomeEvent[]> {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "[netsuite] Fixture adapter must not run in production. " +
            "Deploy the live NetSuite adapter in Phase 62."
        );
      }

      const polledAt = since.toISOString();
      return [
        {
          tenantId: "default-tenant",
          correlationId: "fixture-netsuite-001",
          sourceSystem: "finance",
          adapter: "netsuite",
          eventType: "transaction_posted",
          kpiKey: "completion_rate",
          kpiValue: 1,
          rawJson: JSON.stringify({
            transactionId: "TXN-001",
            status: "Paid In Full",
            correlationId: "fixture-netsuite-001",
          }),
          polledAt,
        },
        {
          tenantId: "default-tenant",
          correlationId: "fixture-netsuite-001",
          sourceSystem: "finance",
          adapter: "netsuite",
          eventType: "payment_reconciled",
          kpiKey: "approval_rate",
          kpiValue: 1,
          rawJson: JSON.stringify({
            transactionId: "TXN-001",
            reconciled: true,
            correlationId: "fixture-netsuite-001",
          }),
          polledAt,
        },
      ];
    },
  };
}
