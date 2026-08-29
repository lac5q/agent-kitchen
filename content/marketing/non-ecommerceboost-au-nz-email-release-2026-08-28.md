---
title: "Non-EcommerceBoost AU/NZ email release — August 28, 2026"
description: "Production record for the same-day Turned Comics and Make Me Jedi AU/NZ Father’s Day follow-ups, including audience gates, received-seed QA, delivery results, PopSmiths hold, and channel handoff."
publishedAt: "2026-08-28"
tags: [email-operations, production-release, fathers-day, turned-comics, make-me-jedi, popsmiths, sendgrid]
keywords: [AU/NZ, consent, suppressions, received MIME, duplicate prevention, same-day release, delivery reconciliation]
author: "Codex"
source_session: "mkt-hub same-day non-US release 2026-08-28"
model: "gpt-5.6-sol"
sources:
  - "mkt-hub:email/same-day-2026-08-28/RESULTS.md@ebf3b4e4"
  - "mkt-hub:email/same-day-2026-08-28/turnedcomics/manifest.json@ebf3b4e4"
  - "mkt-hub:email/same-day-2026-08-28/makemejedi/manifest.json@ebf3b4e4"
  - "mkt-hub:email/same-day-2026-08-28/popsmiths/evidence.json@ebf3b4e4"
  - "live:SendGrid Email Activity and scheduled-send APIs, checked 2026-08-28 PDT / 2026-08-29 UTC"
  - "live:Gmail full-message MIME for the exact Turned Comics and Make Me Jedi seeds"
  - "https://www.turnedcomics.com/products/turned-comics"
  - "https://makemejedi.com/products/fathers-day"
  - "https://turnedyellow.slack.com/archives/C0982PYLYTV/p1787972780914879"
  - "https://turnedyellow.slack.com/archives/C09NGKEHXL0/p1787972835726509"
  - "https://turnedyellow.slack.com/archives/C0ACMS863TR/p1787972849383079"
derived_from:
  - "content/marketing/non-ecommerceboost-send-audit-2026-08-28.md"
  - "content/marketing/au-nz-fathers-day-urgency-override-2026-08-23.md"
regen_prompt: "Reconcile the exact live campaign identities, current consented and positively geo-identified audiences, all provider suppressions, recent-send cadence, received Gmail MIME, brand claims, provider activity, and delivery events for the August 28 non-EcommerceBoost AU/NZ releases without exposing recipient data."
---

# Non-EcommerceBoost AU/NZ email release — August 28, 2026

## Outcome

Two independently managed AU/NZ Father’s Day follow-ups were released after a same-day urgency override and exact production gates:

| Brand | Subject | Audience | Accepted | Delivered | Failed | Uncertain |
|---|---|---:|---:|---:|---:|---:|
| Turned Comics | `Dad's camera roll has a secret identity` | 5 | 5 | 5 | 0 | 0 |
| Make Me Jedi | `Dad has been promoted to council legend` | 8 | 8 | 8 | 0 | 0 |

Total: 13 accepted and 13 delivered. No production message failed or entered an uncertain state. No schedule was created.

TurnedYellow and all EcommerceBoost-managed campaign state remained out of scope and untouched.

## Why this supersedes the earlier August 28 hold

The earlier afternoon audit recommended zero sends because no independent campaign was then release-ready. The operator subsequently issued an explicit same-day urgency instruction for non-EcommerceBoost brands, with emphasis on AU/NZ Father’s Day lead time. New, distinct follow-up creative was produced, exact audiences were rebuilt, seeds were received and inspected, and hash-bound approval was recorded before release. The earlier hold remains correct for the state observed at that time; this document records the later production-ready state and outcome.

## Turned Comics release

- Campaign ID: `same_day_2026_08_28_turnedcomics_au_nz`
- Audience: 5 positively consented, positively AU/NZ-identified subscribers after current SendGrid suppressions and the 72-hour portfolio cadence gate.
- Audience SHA-256: `e506148557dfb6434b58e73da426494c6ac8383eaa13651e86219e34fe43f898`.
- The concept was a digital comic-cover transformation with no discount, physical-arrival promise, or false deadline.
- Live exact-subject activity and scheduled sends were zero immediately before release.
- The first exact seed exposed mojibake in punctuation. Visible HTML punctuation was converted to entities and plaintext punctuation to ASCII. A second exact seed then passed received-MIME review.
- The corrected seed passed SPF, DKIM, DMARC, one-click list-unsubscribe, legal-address and opt-out checks in both HTML and plaintext, hero presence, and tracked CTA checks.
- SendGrid accepted 5/5 and later reported 5/5 delivered.

## Make Me Jedi release

- Campaign ID: `same_day_2026_08_28_mmj_au_nz`
- Audience: 8 positively consented, positively AU/NZ-identified subscribers after current provider suppressions.
- Final release-set SHA-256: `cfc1e0551236a52461978b507f6f141d0bc80d6e9a3eb6cf4e2e53e17c21f09b`.
- The concept promoted Dad to “council legend,” led with the digital portrait, and made no arrival guarantee or false last-chance claim.
- The live `DAD20` offer and free-animation claim were reverified on the Make Me Jedi Father’s Day product page before release.
- This one campaign used Make Me Jedi’s authenticated SendGrid fallback. The tested Omnisend HTML path generates a plaintext alternative that omits the required postal address; SendGrid preserved the caller-supplied compliant plaintext.
- A first seed resolved to an obsolete Luis-owned reviewer inbox that is not connected to the operational Gmail review path. No customer received it. The runner was rebound to the current hash-locked reviewer, and only the corrected received seed authorized production.
- The corrected seed passed SPF, DKIM, DMARC, one-click list-unsubscribe, legal-address and opt-out checks in both HTML and plaintext, hero presence, and tracked CTA checks.
- SendGrid accepted 8/8 and later reported 8/8 delivered.

## PopSmiths hold

No PopSmiths broadcast was sent or scheduled. The executable AU/NZ audience was zero because no positively evidenced AU or NZ membership was available. Unknown geography was excluded rather than treated as non-US. Its universal style concept remains staged for a later U.S. review window, still subject to readable consent identities, provider inventory, exact received seed, and final approval.

## Channel handoff

- Turned Comics: production result posted to `#turned-comics-launch`.
- Make Me Jedi: production result posted to internal `#new-project-emails`. The established Make Me Jedi client channel is Slack Connect and rejected connector writes.
- PopSmiths: hold status posted to `#popsmiths_launch`.

## Durable implementation record

The complete HTML, plaintext, renders, manifests, QA evidence, safe runners, and public release summary are committed in `mkt-hub` commit `ebf3b4e4`. Recipient exports, approvals, seed evidence, HMAC keys, and per-recipient ledgers remain private and gitignored.
