---
title: "PopSmiths SEO style demand and email segmentation"
description: "Live Search Console and GA4 ranking of PopSmiths art-style demand, with a consent-aware email routing recommendation."
publishedAt: "2026-08-20"
tags: [popsmiths, seo, email, segmentation, family-guy]
keywords: [google-search-console, ga4, organic-search, style-personalization, video-follow-up]
author: "Codex"
source_session: "/root"
model: "gpt-5"
sources:
  - "gsc:sc-domain:popsmiths.com"
  - "ga4:523639779"
  - "https://www.popsmiths.com/styles/family_guy"
  - "https://www.popsmiths.com/styles/rick_morty"
  - "https://www.popsmiths.com/blog/bobs-burgers-portrait-style"
derived_from:
  - "content/research/popsmiths-video-consent-audit-2026-08-20.md"
regen_prompt: "Re-query final GSC and GA4 organic-search data for PopSmiths by landing page and query, rank style themes, reconcile the results with creation/video style records and affirmative marketing consent, and update the email-routing recommendation."
---

# Decision

Use the recipient's recorded creation or video style as the primary email theme whenever that signal is trustworthy. Use a broad “Pets & More” email only when the style is unknown. Do not treat style use or video receipt as marketing consent; audience eligibility must pass a separate affirmative-consent and suppression gate.

# Organic style demand

Final Google Search Console data runs through 2026-08-17. The longer GSC comparison covers 2026-03-01 through 2026-08-17; GA4 organic sessions cover 2026-05-20 through 2026-08-17.

| Rank | Style/theme | GSC clicks | GSC impressions | GA4 organic sessions |
|---|---|---:|---:|---:|
| 1 | Family Guy | 119 | 2,058 | 92 |
| 2 | Rick & Morty | 31 | 1,488 | 26 |
| 3 | Bob’s Burgers content/style | 18 | 310 | 13 |
| 4 | Simpsons | 8 | 2,895 | 6 |
| 5 | F1 Racing | 5 | 43 | 5 |
| 6 | Minecraft | 3 style-page clicks; 7 including product pages | 425 | 4 |
| 7 | South Park | 3 | 2,331 | 3 |
| 8 | Pets | 1 across pet pages | 189+ | 2 |

Family Guy is the clear proven leader. In the latest 28-day window, its style page recorded 25 GSC clicks and 25 GA4 organic sessions, compared with 12 GSC clicks and 10 GA4 sessions for Rick & Morty. Bob’s Burgers is third and recently strengthening. Simpsons and South Park have high impressions but weak rankings and click-through rates, so they are visibility opportunities rather than current traffic winners.

# Email routing

1. Known style and affirmative PopSmiths consent: use the exact style in the subject, hero illustration, body, and CTA.
2. Known pet style and consent: use a pet-focused message.
3. Video recipient with consent but no reliable style: use a broad “Pets & More” message led by Family Guy, followed by Rick & Morty, Bob’s Burgers, and one pet style.
4. No affirmative consent: do not place the contact in a marketing send. Treat the cohort as a consent-gap/re-permission product-flow problem.
5. Exclude anyone already sent the same day and reconcile all provider suppressions immediately before release.

# Creative implication

The default creative hierarchy should mirror measured demand rather than present every style equally. Family Guy leads, Rick & Morty supports, Bob’s Burgers supplies a second warm animated direction, and a pet module keeps the broader PopSmiths promise visible. Marketing body copy should remain at least 18px on desktop and 17px on mobile, with 20px intro copy and a 46px desktop headline.
