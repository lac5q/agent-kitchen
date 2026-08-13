---
name: "SketchPop QuickBooks and Truthifi reconciliation update"
title: "SketchPop QuickBooks and Truthifi reconciliation update"
description: "Read-only QuickBooks and Truthifi account, balance, cash-flow, and transaction capture for Wise and Bluevine, with SQLite import and reconciliation caveats."
publishedAt: "2026-08-12"
tags: [sketchpop, finance, quickbooks, truthifi, wise, bluevine, reconciliation, sqlite]
keywords: [QuickBooks, Truthifi, Wise, Bluevine, SQLite, cash flow, transactions, account balance]
author: "Codex"
source_session: "019ff7da-ddc5-7c33-b84f-ba49034338f2"
model: "gpt-5"
sources:
  - "label:QuickBooks MCP snapshot captured 2026-08-12"
  - "label:Truthifi MCP read-only calls captured 2026-08-12"
  - "label:Truthifi tool catalog and subscription response"
  - "label:SketchPop private SQLite ledger"
derived_from: []
regen_prompt: "Pull the current read-only QuickBooks reports and Truthifi account, balance, summary, and transaction pages for SketchPop LLC; compare Wise and Bluevine balances; preserve raw private snapshots; import idempotently into the SQLite ledger; and refresh findings without writing to QuickBooks or financial institutions."
---

# SketchPop QuickBooks and Truthifi reconciliation update

## Scope

Read-only data for SketchPop LLC was captured on 2026-08-12. QuickBooks covers 2026-01-01 through 2026-08-12. Truthifi was authorized through its Streamable HTTP MCP endpoint and queried without starting a refresh scan or writing to any connected account.

## Truthifi capture

- Subscription: Free Checkup.
- Quota at capture: 5 daily credits and 25 monthly credits. The capture used 5 daily and 5 monthly credits; the daily limit was reached.
- Linked banking accounts: Bluevine Checking and Wise (US) USD account.
- Availability: Bluevine reported 2025-08-04 through 2026-08-12. Wise reported 2025-07-15 through 2026-08-12.
- Balance history: 2 account records and 2 balance records.
- Budget-flow summary: 8 monthly rows covering 517 categorized transactions for 2026-01-01 through 2026-08-12.
- Transaction detail: 2 pages, 40 returned records, 38 unique records after deterministic deduplication. The pages cover 2026-05-14 through 2026-05-20 and report more pages available. The sample is not a full YTD export.
- The first two transaction pages contain 24 transfers, 9 inflows, and 5 outflows. Transfer rows dominate the sample, so their gross amount must not be treated as operating revenue or expense.

Truthifi reported that one linked aggregator was temporarily out of service. Its balances and holdings may therefore be stale. No `run_scan` call was made because Truthifi says daily automatic refresh normally makes that unnecessary and the call costs 3 credits.

## Balance reconciliation

| Account | Truthifi ending balance | QuickBooks balance-sheet balance | Difference |
| --- | ---: | ---: | ---: |
| Wise | $5,618.01 | $5,618.01 | $0.00 |
| Bluevine | $4,359.29 | $6,206.69 | -$1,847.40 |
| Combined Wise + Bluevine | $9,977.30 | $11,824.70 | -$1,847.40 |

The Wise balance agrees exactly at the captured date. Bluevine needs investigation, subject to the Truthifi aggregator-staleness warning and any QuickBooks reconciliation timing difference.

Truthifi balance history moved from $8,458.42 to $5,618.01 for Wise and from $124,844.30 to $4,359.29 for Bluevine over the requested range. These opening values should not be compared to QuickBooks without confirming that both systems use the same opening date and cleared-transaction basis.

## QuickBooks context

The QuickBooks YTD snapshot reports income of $225,615.83, gross profit of $145,656.69, gross profit margin of 64.6%, and net income of -$256,553.27. Cash flow reports operating activities of -$124,174.70, financing activities of -$20,265.46, net cash decrease of -$144,440.16, and cash at end of period of $14,747.46.

The balance sheet reports assets of $1,305,690.61, liabilities of $1,505,218.18, and equity of -$199,527.57. Its net-income line differs from the P&L by a material amount: -$4,889.32 versus -$256,553.27. Sales-by-customer and sales-by-product returned no rows even though the P&L contains income. These are unresolved report-scope or mapping issues.

## Private ledger

Truthifi raw responses are stored with mode 600 under `/home/lac5q/github/SketchPop/data/private_finance/`. The SQLite ledger is `/home/lac5q/github/SketchPop/data/private_finance/quickbooks.sqlite`.

The Truthifi importer added 8 sync runs, 8 reports, 81 metrics, and 38 unique transaction rows. A rerun added no rows. SQLite integrity check passed. The normalized transaction table contains no credential-shaped fields. OAuth access and refresh tokens were kept in memory during the session and were not persisted.

## Safe next actions

1. Wait for the Truthifi daily reset before requesting more transaction pages; continue from the stored pagination cursor.
2. Reconcile the remaining Truthifi pages against QuickBooks bank-feed transactions and the Bluevine/Wise account rows.
3. Investigate the $1,847.40 Bluevine difference after confirming aggregator freshness and reconciliation dates.
4. Resolve the QuickBooks P&L/balance-sheet mismatch before using combined profitability metrics.
5. Do not post journal entries, import into QuickBooks, move funds, or send messages from this dataset without explicit review and approval.
