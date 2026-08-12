---
name: "SketchPop QuickBooks financial snapshot and reconciliation plan"
title: "SketchPop QuickBooks financial snapshot and reconciliation plan"
description: "Read-only QuickBooks YTD snapshot for SketchPop LLC with cross-report discrepancies and the transaction-level Truthifi/Wise/Bluevine reconciliation plan."
publishedAt: "2026-08-12"
tags: [sketchpop, finance, quickbooks, truthifi, reconciliation]
keywords: [QuickBooks, Truthifi, Wise, Bluevine, SQLite, cash flow, reconciliation]
author: "Codex"
source_session: "019ff7da-ddc5-7c33-b84f-ba49034338f2"
model: "gpt-5"
sources:
  - "label:QuickBooks MCP snapshot captured 2026-08-12"
  - "label:SketchPop private SQLite ledger"
derived_from: []
regen_prompt: "Pull the same read-only QuickBooks reports for SketchPop LLC, verify Truthifi authentication, import transaction exports from Truthifi/Wise/Bluevine, and refresh the reconciliation findings without writing back to QuickBooks."
---

# SketchPop QuickBooks financial snapshot

## Scope

Read-only QuickBooks reports for SketchPop LLC, captured for 2026-01-01 through 2026-08-12 with an accrual-basis balance-sheet snapshot as of 2026-08-12. The QuickBooks batch included company information, profit and loss, cash flow, balance sheet, A/R aging, A/P aging, sales by customer, and sales by product/service.

## Analysis

- QuickBooks P&L reports total income of $225,615.83, gross profit of $145,656.69, gross profit margin of 64.6%, and net income of -$256,553.27.
- Cash flow reports operating activities of -$124,174.70, financing activities of -$20,265.46, net cash decrease of -$144,440.16, and cash at end of period of $14,747.46.
- Balance sheet reports total assets of $1,305,690.61, total liabilities of $1,505,218.18, and total equity of -$199,527.57. It lists Bluevine Checking at $6,206.69 and Wise at $5,618.01.
- The balance sheet reports $0 A/R and $0 A/P, and the A/R and A/P aging reports returned no outstanding balances as of the snapshot date.
- The P&L and balance sheet net-income lines differ materially: -$256,553.27 versus -$4,889.32. This must be investigated before relying on a combined profitability view.
- Sales-by-customer and sales-by-product reports returned no rows for the same period even though the P&L contains income. This is a report-mapping or data-scope issue, not evidence that sales were zero.
- No transaction-level bank data was captured in this batch. Truthifi, Wise, and Bluevine transaction exports are required for reconciliation and deduplication.

## Reconciliation design

The private SketchPop ledger is `data/private_finance/quickbooks.sqlite`. It stores the raw report snapshot separately from normalized report metrics and findings. The `transactions` table is reserved for future Truthifi, Wise, and Bluevine imports and deduplicates on `(source, external_id)`. The raw QuickBooks payload is `data/private_finance/quickbooks-ytd-2026-08-12.raw.json`. Both paths are ignored by Git.

## Next safe actions

1. Complete Truthifi OAuth through the registered Streamable HTTP MCP server.
2. Pull the broadest available read-only Truthifi transaction/account export in one batch.
3. Add Wise and Bluevine exports or connectors, then normalize each transaction with source, external ID, date, account, description, amount, currency, and raw payload.
4. Reconcile bank totals against the QuickBooks account rows before any QuickBooks import or write-back.
5. Do not post journal entries, import transactions into QuickBooks, move funds, or send messages until the discrepancies are reviewed.
