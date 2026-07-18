---
title: "Recovered research — luis (session 20260423_114308_9e515ec9)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, luis]
author: "Alba [bot]"
source_session: "20260423_114308_9e515ec9"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260423_114308_9e515ec9.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260423_114308_9e515ec9.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — luis

**Source session:** `20260423_114308_9e515ec9`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 4390 characters of the largest assistant-side structured block recovered from the session transcript.

```
Here you go — every field ready to copy-paste straight into the Workday form:

---

## Work Experience 1 (Current — check "I currently work here")

**Job Title:**
```
Managing Partner & Agentic Systems Architect
```

**Company:**
```
Epilogue Capital / PopSmiths
```

**Location:**
```
San Diego, CA
```

**From:**
```
01/2018
```

**Role Description:**
```
Built and operate a 17-agent autonomous organization serving 600K+ customers across 4 brands. Architected a workflow orchestration platform connecting content creation, design, QA, approval, publishing, and verification with no human in loop. Designed integration contracts and API surfaces for internal agents and external tools (Shopify, Meta Ads, Google Ads, Gooten). Built 3-layer memory architecture (episodic, document knowledge, code graph). Established governance framework with approval gates, budget caps, consent gating, and full audit trails processing 2B+ tokens/week. Built AI-assisted decisioning including predictive batching, anomaly detection, and runtime recommendations. Built skillshare system syncing 125+ skills across 7 agent platforms.
```

---

## Work Experience 2

**Job Title:**
```
Principal Product Manager (Group PM) — AI/ML Products
```

**Company:**
```
Intuit — TurboTax Self-Employed
```

**Location:**
```
San Diego, CA
```

**From:**
```
01/2021
```

**To:**
```
12/2024
```

**Role Description:**
```
Led product for a $900M PLG business serving 4M+ solopreneurs in a pure self-serve, zero-sales-team, freemium model. Delivered 10–15% CAGR ($100–150M annual growth). Shipped 4 AI/ML products through IRS compliance, legal review, and financial audit gates including Expense Categorization ML (reduced manual entry 60%+), Deduction Finder ML (increased average refund $1,200+), Audit Risk Predictor, and Document Extraction OCR/NLP pipeline. Built go/no-go evaluation frameworks for AI output safety at scale. Hired and mentored 4 Product Managers. Established OKRs, experimentation frameworks, and metrics-driven culture.
```

---

## Work Experience 3

**Job Title:**
```
Director, Product Management — Growth & Subscriptions
```

**Company:**
```
Ancestry
```

**Location:**
```
San Francisco, CA
```

**From:**
```
01/2016
```

**To:**
```
12/2017
```

**Role Description:**
```
Led growth initiatives on $800M subscriptions product with Director-level ownership of mobile, onboarding, and checkout. Drove +30% lift in mobile subscriptions through improved onboarding flow and checkout experience. Built abandon cart email campaign resulting in +5% revenue lift. Designed and shipped new product shopping experiences improving top-of-funnel conversion.
```

---

## Work Experience 4

**Job Title:**
```
Product Manager — Marketplace & Checkout
```

**Company:**
```
eBay
```

**Location:**
```
San Francisco, CA
```

**From:**
```
01/2013
```

**To:**
```
12/2015
```

**Role Description:**
```
Owned checkout experience, cart optimization, and buyer registration flows across mobile and web serving millions of global buyers. Drove +2% checkout conversion improvement = $100M+ annualized revenue lift through data-driven UX improvements and A/B testing. Reduced checkout defects 33% via quality process improvements. Analyzed millions of transactions to eliminate friction in the buyer journey.
```

---

## Education 1

**School:**
```
University of Michigan
```

**Degree:**
```
Master's Degree
```

**Field of Study:**
```
MBA / MS Natural Resources (Erb Institute)
```

**GPA:**
```
GMAT 720 (96th percentile)
```

---

## Education 2

**School:**
```
University of Virginia
```

**Degree:**
```
Bachelor's Degree
```

**Field of Study:**
```
Electrical Engineering
```

---

## Skills (copy one at a time into the "Type to Add Skills" box)

- Product Management
- Workflow Orchestration
- Platform Architecture
- API Design
- AI/ML Product Management
- LLM Integration
- Predictive Analytics
- Anomaly Detection
- Compliance-Ready AI
- PLG (Product-Led Growth)
- A/B Testing
- Cohort Analysis
- Funnel Optimization
- Cross-Functional Leadership
- Systems Thinking
- 0 to 1 Product Shipping
- OKR Setting
- PM Mentorship
- Node.js
- Next.js
- PostgreSQL
- Qdrant
- Cursor
- Claude Code
- Figma
- JIRA
- Mixpanel

---

## Website

```
https://linkedin.com/in/luiscalderonmba
```

---

Just triple-click each block to select it, copy, paste into Workday. Lmk when you hit the next page.
```

## Why this was missed

The detector classifies this session as research-without-persist because:

1. The session produced structured markdown output (research, comparison, analysis, or recommendations)
2. The session cited external sources OR the user message asked to save/document/file
3. The session never called `mcp_memroos_knowledge_write`

This is a pre-ratchet-era finding — the ratchet fix (`--full` flag discipline +
last-run marker for incremental scans) was deployed after this session completed.
The current daily incremental scan is clean; these backlog entries reflect
sessions that completed before the persist gatekeeper was tightened.

## Recovery status

This is a backfill artifact. The original session content was preserved in
the Hermes session log at `~/.hermes/sessions/20260423_114308_9e515ec9.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
