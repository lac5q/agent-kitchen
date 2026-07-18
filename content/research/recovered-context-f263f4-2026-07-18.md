---
title: "Recovered research — context (session 20260505_024703_f263f4)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260505_024703_f263f4"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260505_024703_f263f4.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260505_024703_f263f4.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260505_024703_f263f4`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 4421 characters of the largest assistant-side structured block recovered from the session transcript.

```
Using skills: `job-discovery`, `luis-resume-rules`, `executive-resume-critique`.

Done. I prepared the **10 remaining viable jobs** from the fresh scan so they’re ready for morning submission.

Master packet:
```text
/Users/lcalderon/github/jobhunt/pipeline-runs/MORNING_SUBMISSION_PACK_20260505.md
```

Machine-readable manifest:
```text
/Users/lcalderon/github/jobhunt/pipeline-runs/remaining-application-packages-20260505.json
```

Skip memo for the low-fit roles I did not prep:
```text
/Users/lcalderon/github/jobhunt/pipeline-runs/scan-20260505-skip-memo.md
```

Validation passed for every package:
```text
Resume: 2 pages
Cover letter: 1 page
No overflow
No em dashes detected
GitHub included
Intuit appears on page 1
Education dates removed
PNG previews generated
```

Prepared jobs, in submit order:

1. Apollo.io — Product Builder, AI Agents
```text
Apply: http://job-boards.greenhouse.io/apolloio/jobs/5740169004
Resume: /Users/lcalderon/github/jobhunt/resumes-apollo/Luis-Calderon-Apollo-Product-Builder-AI-Agents.pdf
Cover: /Users/lcalderon/github/jobhunt/resumes-apollo/Luis-Calderon-Apolloio-Cover-Letter.pdf
```

2. ServiceNow — Staff Product Manager, Cloud Infrastructure
```text
Apply: https://jobs.smartrecruiters.com/ServiceNow/744000105207745-staff-product-manager-cloud-infrastructure
Resume: /Users/lcalderon/github/jobhunt/resumes-servicenow/Luis-Calderon-ServiceNow-Staff-PM-Cloud-Infrastructure.pdf
Cover: /Users/lcalderon/github/jobhunt/resumes-servicenow/Luis-Calderon-ServiceNow-Cover-Letter.pdf
```

3. Zeta Global — Senior Product Manager, AI Agents
```text
Apply: https://builtin.com/job/senior-product-manager/7123787
Resume: /Users/lcalderon/github/jobhunt/resumes-zeta/Luis-Calderon-Zeta-Senior-PM-AI-Agents.pdf
Cover: /Users/lcalderon/github/jobhunt/resumes-zeta/Luis-Calderon-Zeta-Global-Cover-Letter.pdf
```

4. GC AI — Head of Self-Serve & Product-Led Growth
```text
Apply: https://jobs.gem.com/gc-ai/am9icG9zdDqOsP4fEq0ZXkJMo7FygC_5
Resume: /Users/lcalderon/github/jobhunt/resumes-gc-ai/Luis-Calderon-GC-AI-Head-Self-Serve-PLG.pdf
Cover: /Users/lcalderon/github/jobhunt/resumes-gc-ai/Luis-Calderon-GC-AI-Cover-Letter.pdf
```

5. Hadrius — Product Manager
```text
Apply: https://www.ycombinator.com/companies/hadrius/jobs/19cgt56-product-manager
Resume: /Users/lcalderon/github/jobhunt/resumes-hadrius/Luis-Calderon-Hadrius-Product-Manager.pdf
Cover: /Users/lcalderon/github/jobhunt/resumes-hadrius/Luis-Calderon-Hadrius-Cover-Letter.pdf
```

6. Zscaler — Senior Product Manager, AI / Data Classification
```text
Apply: https://job-boards.greenhouse.io/zscaler/jobs/5122174007
Resume: /Users/lcalderon/github/jobhunt/resumes-zscaler/Luis-Calderon-Zscaler-Senior-PM-AI-Data-Classification.pdf
Cover: /Users/lcalderon/github/jobhunt/resumes-zscaler/Luis-Calderon-Zscaler-Cover-Letter.pdf
```

7. Veeva — Product Manager/Director, Marketing Analytics, Crossix
```text
Apply: https://jobs.lever.co/veeva/8c19d533-13dd-43c8-9de4-31d43574184a/apply
Resume: /Users/lcalderon/github/jobhunt/resumes-veeva/Luis-Calderon-Veeva-Product-Director-Marketing-Analytics-Crossix.pdf
Cover: /Users/lcalderon/github/jobhunt/resumes-veeva/Luis-Calderon-Veeva-Cover-Letter.pdf
```

8. Dynatrace — Senior AI Product Manager
```text
Apply: https://www.dynatrace.com/careers/jobs/1370163900/
Resume: /Users/lcalderon/github/jobhunt/resumes-dynatrace/Luis-Calderon-Dynatrace-Senior-AI-Product-Manager.pdf
Cover: /Users/lcalderon/github/jobhunt/resumes-dynatrace/Luis-Calderon-Dynatrace-Cover-Letter.pdf
```

9. TrueML — Sr. Product Manager, Consumer Payment Portal
```text
Apply: https://jobs.lever.co/trueml/b9801d8d-7566-4a37-9932-5900a76bd84a/apply
Resume: /Users/lcalderon/github/jobhunt/resumes-trueml/Luis-Calderon-TrueML-Senior-PM-Consumer-Payment-Portal.pdf
Cover: /Users/lcalderon/github/jobhunt/resumes-trueml/Luis-Calderon-TrueML-Cover-Letter.pdf
```

10. GoGoGrandparent — Product Manager
```text
Apply: https://www.ycombinator.com/companies/gogograndparent/jobs/uvSRsHf-product-manager
Resume: /Users/lcalderon/github/jobhunt/resumes-gogograndparent/Luis-Calderon-GoGoGrandparent-Product-Manager.pdf
Cover: /Users/lcalderon/github/jobhunt/resumes-gogograndparent/Luis-Calderon-GoGoGrandparent-Cover-Letter.pdf
```

I did **not submit anything**. Morning flow: open the master packet, go one by one, attach the resume + cover, and use `Career Connector` when asked how you heard about the role.
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
the Hermes session log at `~/.hermes/sessions/20260505_024703_f263f4.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
