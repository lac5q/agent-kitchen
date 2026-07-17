---
title: Content cron audit — 2026-07-14
model: gpt-5.6-terra
sources:
  - ~/.hermes/cron/jobs.json
  - ~/.hermes/cron/output/
  - ~/content-os/
derived_from: live cron and content-store audit
---

# Content cron audit — 2026-07-14

## Executive finding

All 18 content-related Hermes cron jobs are currently enabled and report a successful most-recent run. That green state is misleading: the system creates many separate Discord threads and draft files, but has no reliable central approval queue. Work is being produced, but Luis cannot easily see what needs a decision or whether an email approval was actually sent.

## Current approval decisions

1. **AI Journey #4, "The Stack That Almost Broke Me"** — personal LinkedIn draft; explicitly awaiting GO. Review thread: `1526695531663851622`.
2. **Weekly AI Agent Repos (Jul 13)** — one 7-post X thread and one GrowthAlchemy LinkedIn post; both pending explicit GO. Review thread: `1526258213589221490`.
3. **X Reactive Content (Jul 14)** — five X candidates were generated and passed the human-copy gate. They are not awaiting actionable approval because the email handoff failed silently.
4. **Reverse Information Paradox / Own the Learning Loop** — complete HIL package is staged but not committed or published; requires a full preview and explicit GO. Podcast audio remains blocked on voice-clone QA.

## Root causes

- **Approval-email parser drift:** `content-approval-email.py` only parses `## Post N — title` blocks. The current daily file uses `## option N`, so the email job prints nothing and no `email-approval-pending.json` state file exists. Five current X candidates are invisible to the approval workflow.
- **Two content stores:** reconciliation writes `~/github/contentmachine/stores/content-registry.json`; approval scripts read `~/content-os/stores/content-registry.json`. The reconciliation store reports 55 items / 14 queued while the approval store contains only one unrelated `contents` record. This makes queue counts and approvals disagree.
- **LinkedIn scout produces angles, not approval-ready posts:** daily virality packs label three angles as approval-ready but contain no full LinkedIn copy. They are ideas, not approval decisions.
- **Noisy, contradictory LinkedIn gate audit:** the six-hour audit reports 33 historical failures because it requires both media and a GrowthAlchemy URL in the LinkedIn body. Current content policy requires no external URL in the body and uses first-comment placement. The alert is policy-drift noise, not an instruction to delete or republish 33 posts.
- **Daily performance email is broken:** its Jul 14 run posted Discord successfully but Gmail delivery failed with Google Cloud 403.

## Cron health

- 18 content jobs: enabled, scheduled, latest status `ok`.
- Content registry reconciliation previously timed out at 12:25; it was replaced by a deterministic no-agent wrapper and completed at 17:45.
- The wrapper still emits the false-positive historical LinkedIn audit.
- Content output otherwise reaches new Discord threads as configured.

## Recommended minimum repair

1. Fix the approval parser to accept the current candidate file format and send a single consolidated approval email/thread containing exact post text.
2. Point reconciliation and approval scripts at one canonical registry, migrate the valid 55-item/14-queued state once, then remove the duplicate-store fallback.
3. Change the LinkedIn audit to validate media plus a first-comment/article-link record, not a URL in the post body; scope it to new posts only until historical metadata is backfilled.
4. Repair the Google Cloud credential/project used by the daily performance email.
5. Keep generation crons, but collapse their user-facing follow-up into one daily approval digest and one weekly plan thread.
