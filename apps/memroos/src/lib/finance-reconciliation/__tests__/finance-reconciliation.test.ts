// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { buildDefaultEvalConfig, parseEvalConfigYaml } from "@/lib/evals/config";
import {
  generateMockTransactions,
  normalizeWebhookTransaction,
  parseTransactionCsv,
  processReconciliationEvents,
  resolveFinanceTerminology,
  validateFinanceGoldenSetExamples,
} from "../index";

let testDb: Database.Database;

vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: vi.fn(),
}));

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

beforeEach(() => {
  testDb = makeDb();
});

afterEach(() => {
  testDb.close();
});

describe("finance reconciliation parsing", () => {
  it("parses CSV transactions into canonical reconciliation events", () => {
    const csv = [
      "transaction_id,correlation_id,agent_id,amount,expected_amount,status,confidence,reason,occurred_at",
      "txn-1,corr-1,agent-finance,100.00,100.00,matched,0.98,exact match,2026-05-17T10:00:00Z",
      "txn-2,corr-2,agent-finance,120.00,100.00,mismatched,0.61,amount delta,2026-05-17T10:01:00Z",
    ].join("\n");

    const events = parseTransactionCsv(csv);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      transactionId: "txn-1",
      correlationId: "corr-1",
      amount: 100,
      expectedAmount: 100,
      status: "matched",
    });
    expect(events[1].status).toBe("mismatched");
  });

  it("canonicalizes common camelCase CSV headers", () => {
    const csv = [
      "transactionId,correlationId,tenantId,agentId,amount,expectedAmount,status,confidence,occurredAt",
      "txn-camel,corr-camel,tenant-camel,agent-camel,120.00,100.00,mismatched,0.61,2026-05-17T10:01:00Z",
    ].join("\n");

    const [event] = parseTransactionCsv(csv);

    expect(event).toMatchObject({
      transactionId: "txn-camel",
      correlationId: "corr-camel",
      tenantId: "tenant-camel",
      agentId: "agent-camel",
      expectedAmount: 100,
      occurredAt: "2026-05-17T10:01:00Z",
    });
  });

  it("parses quoted CSV fields, CRLF rows, source row aliases, and invalid status fallbacks", () => {
    const csv = [
      "transaction_id,correlation_id,tenant_id,agent_id,amount,expected_amount,status,confidence,reason,occurred_at,sourceRowId",
      "\"txn,quoted\",corr-quoted,tenant-q,agent-q,not-a-number,15.50,unexpected,1.7,\"escaped \"\"reason\"\"\",2026-05-17T10:02:00Z,row-7",
      "",
    ].join("\r\n");

    const [event] = parseTransactionCsv(csv);

    expect(event).toMatchObject({
      transactionId: "txn,quoted",
      tenantId: "tenant-q",
      amount: 0,
      expectedAmount: 15.5,
      status: "exception",
      confidence: 1,
      reason: 'escaped "reason"',
      sourceRowId: "row-7",
    });
  });

  it("normalizes webhook payloads without trusting extra fields", () => {
    const event = normalizeWebhookTransaction({
      transaction_id: "txn-webhook",
      correlation_id: "corr-webhook",
      amount: "42.50",
      expected_amount: "40.00",
      status: "exception",
      confidence: "0.44",
      reason: "manual review required",
      secret: "should stay only in raw metadata",
    });

    expect(event).toMatchObject({
      transactionId: "txn-webhook",
      correlationId: "corr-webhook",
      amount: 42.5,
      expectedAmount: 40,
      status: "exception",
      confidence: 0.44,
    });
    expect(event.raw).toHaveProperty("secret");
  });
});

describe("finance reconciliation processing", () => {
  it("writes L3 finance events, immutable audit rows, and HIL exceptions", () => {
    const [matched, mismatched] = parseTransactionCsv([
      "transaction_id,correlation_id,agent_id,amount,expected_amount,status,confidence,reason,occurred_at",
      "txn-1,corr-1,agent-finance,100.00,100.00,matched,0.98,exact match,2026-05-17T10:00:00Z",
      "txn-2,corr-2,agent-finance,120.00,100.00,mismatched,0.61,amount delta,2026-05-17T10:01:00Z",
    ].join("\n"));

    const summary = processReconciliationEvents([matched, mismatched], testDb, {
      actorId: "agent-finance",
      openHilForExceptions: true,
    });

    expect(summary).toMatchObject({
      processed: 2,
      matched: 1,
      mismatched: 1,
      escalated: 1,
      auditEntries: 2,
      hilEscalations: 1,
    });

    const outcomeRows = testDb
      .prepare("SELECT correlation_id, source_system, adapter, kpi_key FROM business_outcome_events ORDER BY correlation_id, kpi_key")
      .all() as Array<{ correlation_id: string; source_system: string; adapter: string; kpi_key: string }>;
    expect(outcomeRows.length).toBeGreaterThanOrEqual(8);
    expect(outcomeRows.every((row) => row.source_system === "finance")).toBe(true);
    expect(outcomeRows.every((row) => row.adapter === "bank_reconciliation")).toBe(true);

    const auditRows = testDb
      .prepare("SELECT event_type, entity_type, entity_id FROM audit_entries ORDER BY created_at")
      .all() as Array<{ event_type: string; entity_type: string; entity_id: string }>;
    expect(auditRows.map((row) => row.event_type)).toContain("finance.reconciliation_matched");
    expect(auditRows.map((row) => row.event_type)).toContain("finance.reconciliation_mismatched");
    expect(auditRows.map((row) => row.event_type)).toContain("hil.created");
    expect(auditRows.some((row) => row.entity_id === "finance_transaction:txn-2")).toBe(true);

    const hilRows = testDb
      .prepare("SELECT entity_id, escalation_type, status FROM hil_escalations")
      .all() as Array<{ entity_id: string; escalation_type: string; status: string }>;
    expect(hilRows).toEqual([
      { entity_id: "finance_transaction:txn-2", escalation_type: "agent_escalate", status: "open" },
    ]);
  });

  it("runs the deterministic 100-transaction demo", () => {
    const events = generateMockTransactions(100);
    const summary = processReconciliationEvents(events, testDb);

    expect(summary.processed).toBe(100);
    expect(summary.matched + summary.mismatched + summary.exceptions + summary.duplicates).toBe(100);
    expect(summary.auditEntries).toBe(100);
    expect(summary.hilEscalations).toBe(summary.escalated);
  });
});

describe("finance terminology and golden-set coverage", () => {
  it("loads finance terminology from eval config", () => {
    const config = parseEvalConfigYaml(`
judge_model:
  provider: anthropic
finance:
  enabled: true
  transaction_label: bank transaction
  reconciliation_label: reconciliation
  exception_label: exception
  golden_set: ./golden-sets/finance-reconciliation.jsonl
`);

    expect(resolveFinanceTerminology(config)).toEqual({
      enabled: true,
      trace: "bank transaction",
      eval: "reconciliation",
      proposal: "exception",
    });
  });

  it("defaults finance terminology to disabled generic labels", () => {
    expect(resolveFinanceTerminology(buildDefaultEvalConfig())).toEqual({
      enabled: false,
      trace: "trace",
      eval: "eval",
      proposal: "proposal",
    });
  });

  it("validates reconciliation golden-set examples cover match, mismatch, and escalation", () => {
    const result = validateFinanceGoldenSetExamples([
      { tags: ["finance-reconciliation", "match"], humanScore: 1 },
      { tags: ["finance-reconciliation", "mismatch"], humanScore: 0.35 },
      { tags: ["finance-reconciliation", "escalation"], humanScore: 0 },
    ]);

    expect(result.ok).toBe(true);
    expect(result.coverage).toEqual({ match: true, mismatch: true, escalation: true });
    expect(result.agreementFloor).toBe(0.85);
  });
});
