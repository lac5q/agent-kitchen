---
title: "Recovered research — context (session 20260505_015218_d4b1c4)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260505_015218_d4b1c4"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260505_015218_d4b1c4.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260505_015218_d4b1c4.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260505_015218_d4b1c4`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 1435 characters of the largest assistant-side structured block recovered from the session transcript.

```
Using skill: `luis-resume-rules` + `executive-resume-critique`

Next role is ready:

**Hometap — Principal Product Manager, New Products**  
Synopsis: Zero-to-one product role to lead Hometap’s expansion from one strong home equity investment product into a multi-product fintech company. Strong fit: new product discovery, validation, fintech trust, AI-assisted research/prototyping, executive visibility, and building the roadmap from scratch.

Job link: <https://builtin.com/job/principal-product-manager-new-products/8824695>  
Apply link: <https://job-boards.greenhouse.io/hometap/jobs/5085219007>

Files:
- Resume: `~/github/jobhunt/resumes-hometap/Luis-Calderon-Hometap-Principal-PM-New-Products.pdf`
- Cover letter: `~/github/jobhunt/resumes-hometap/Luis-Calderon-Hometap-Cover-Letter.pdf`
- Notes: `~/github/jobhunt/resumes-hometap/Hometap-Application-Notes.md`

Verified:
- Resume 2 pages
- Cover letter 1 page
- Intuit on page 1
- No em dashes
- Education dates removed
- Visual check passed

I opened the Greenhouse app and staged the known fields plus a “Why Hometap?” answer.

Need your answers before final submit:

1. Visa sponsorship: **No?**
2. Any family/household member currently at Hometap: **No?**
3. Source: use **Career Connector** if available, otherwise **Other?**
4. Demographics: use **Prefer not to answer / decline** for all voluntary fields?

Reply: **“yes use those defaults”** and I’ll finish Hometap.
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
the Hermes session log at `~/.hermes/sessions/20260505_015218_d4b1c4.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
