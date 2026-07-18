---
title: "Recovered research — context (session 20260505_021329_c824e8)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260505_021329_c824e8"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260505_021329_c824e8.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260505_021329_c824e8.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260505_021329_c824e8`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 1634 characters of the largest assistant-side structured block recovered from the session transcript.

```
Using skill: `luis-resume-rules` + `executive-resume-critique`

Moved to **Rula**. Hometap is paused, not submitted.

**Rula — Sr. Product Manager, AI**  
Synopsis: Patient-facing AI product role for clinically grounded therapy support. Strong fit: Intuit AI/ML, human-in-the-loop systems, responsible AI, regulated/high-trust workflows, Doctor.com healthcare context.

Job link:

```text
https://builtin.com/job/sr-product-manager-ai-remote/8508404
```

Apply link:

```text
https://jobs.ashbyhq.com/rula/40915141-68c6-4a00-9581-95b158da6d91?utm_source=W2Xk4xEOO2
```

Resume:

```text
/Users/lcalderon/github/jobhunt/resumes-rula/Luis-Calderon-Rula-Senior-PM-AI.pdf
```

Cover letter:

```text
/Users/lcalderon/github/jobhunt/resumes-rula/Luis-Calderon-Rula-Cover-Letter.pdf
```

Validated:
- Resume is 2 pages
- Cover letter is 1 page
- Intuit appears on page 1
- No em dashes
- Education dates removed
- Visual checks passed

I opened the Ashby app and filled: preferred name, legal name, email, phone, LinkedIn.

Need your approval on these before I continue:

```text
Middle name: N/A
Current state: California
Eligible to work in U.S.: Yes
Need visa sponsorship now/future: No
Ever employee/contractor at Rula: No
Ever credentialed with Rula to see clients: No
Demographics: Prefer not to disclose
Veteran: Prefer not to disclose
```

Snack question suggestion:

```text
Coffee and peanut butter pretzels.
```

Also: resume upload is required. Browser upload is still unreliable, so you may need to manually attach this PDF in Ashby:

```text
/Users/lcalderon/github/jobhunt/resumes-rula/Luis-Calderon-Rula-Senior-PM-AI.pdf
```
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
the Hermes session log at `~/.hermes/sessions/20260505_021329_c824e8.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
