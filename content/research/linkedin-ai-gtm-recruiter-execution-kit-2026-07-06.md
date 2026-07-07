---
title: LinkedIn AI GTM Recruiter Execution Kit
date: 2026-07-06
model: GPT-5 Codex with xhigh multi-agent support
sources:
  - /Users/USERNAME/github/jobhunt/ops-data/linkedin-networking/ai-gtm-recruiter-networking-runbook-2026-07-06.md
  - /Users/USERNAME/github/jobhunt/ops-data/linkedin-networking/message-bank.md
  - /Users/USERNAME/github/jobhunt/ops-data/linkedin-networking/outreach-tracker.csv
  - /Users/USERNAME/github/jobhunt/scripts/open-linkedin-networking-searches.sh
  - https://www.linkedin.com/help/linkedin/answer/a551012/types-of-restrictions-for-sending-invitations
  - https://www.linkedin.com/help/linkedin/answer/a563153/personalize-invitations-to-connect
derived_from:
  - User asked to use m3/xhigh style support to execute the LinkedIn recruiter networking strategy.
regen_prompt: "Create a human-safe execution kit for LinkedIn outreach to AI product, agentic AI, deployment engineering, venture talent, and AI GTM contacts without automating LinkedIn actions."
---

# LinkedIn AI GTM Recruiter Execution Kit

Created a local execution kit in `/Users/USERNAME/github/jobhunt/ops-data/linkedin-networking/`.

Files:

- `ai-gtm-recruiter-networking-runbook-2026-07-06.md`: target rings, title keywords, Boolean searches, company seeds, scoring, disqualifiers, first-week workflow, and safety rules.
- `message-bank.md`: connection notes, accepted-connection follow-ups, and recruiter reply scripts in Luis's preferred direct voice.
- `outreach-tracker.csv`: manual tracker seeded with Benjamin Greenspan.
- `scripts/open-linkedin-networking-searches.sh`: local helper that prints LinkedIn people-search URLs by default, with an explicit `--open` option for manual browser review.

Execution stance:

- Do not automate LinkedIn invitations.
- Do not automate LinkedIn-internal browsing, scraping, profile extraction, messaging, reactions, comments, or connection sending.
- Automate only the safe surrounding workflow: query generation, search URL opening, public non-LinkedIn source discovery, tracker formatting, scoring prompts, message drafting, and weekly metrics.
- Use LinkedIn manually.
- Send 8 to 12 connection requests per day, with only the strongest 3 personalized.
- Track acceptance rate, real conversations, role leads, introductions, and wrong-fit patterns.
- Stop for the day if LinkedIn shows friction prompts or acceptance rate drops sharply.

Target priority:

1. AI product recruiters, AI/ML sourcers, and executive product recruiters.
2. Venture talent partners and portfolio talent leaders for AI funds.
3. AI GTM operators and product advisors who touch agentic AI commercialization.
4. Forward Deployed Engineers, AI Solutions Architects, Field CTOs, and Forward Deployed Engineering Managers at target companies, mainly for referrals and role reality checks.
5. Broad AI recruiters only after higher-intent rings are moving.

Recruiter priority:

1. Company recruiters or sourcers at target AI-core companies hiring for product, forward deployed, deployment, solutions, or applied AI roles.
2. Venture or portfolio talent partners who can route across multiple AI companies.
3. Specialized external recruiters with visible AI product, FDE, deployment, or GTM searches.
4. Senior general recruiters only when they show recent AI-core roles, named clients, or product/executive search ownership.
5. Broad technical recruiters with no AI/product/deployment signal.

Rule of thumb: a junior company recruiter on the right AI/FDE team usually beats a senior generic recruiter.

FDEs are not mainly a recruiter lane. Use them as referral targets, reality checks on whether a deployment role is product-shaped or support-shaped, sources for title language, and bridges to field/product leadership.

Best positioning:

Senior product and GTM operator focused on agentic AI, deployment, and implementation-heavy product roles.
