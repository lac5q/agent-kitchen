---
name: email-campaign-operations
description: Plan, test, schedule, send, and monitor compliant marketing email campaigns across ESPs such as SendGrid and Omnisend. Use whenever Codex prepares a campaign, selects a send time, sends a test or production email, migrates email providers, reconciles audiences or suppressions, or reports delivery outcomes.
---

# Email Campaign Operations

Default to scheduled delivery at the strongest evidence-backed local-time window. Treat immediate sending as an explicit urgency override.

## Workflow

1. Identify the brand, campaign goal, audience, time zones, deadline, sender domain, and provider.
2. Validate the consent source. Require an explicit subscribed/opted-in status; do not infer consent from a contact's presence alone.
3. Reconcile global and brand/group unsubscribes, bounces, blocks, spam reports, and invalid addresses.
4. Verify sender authentication and inspect a received seed message for SPF, DKIM, DMARC, body unsubscribe links, `List-Unsubscribe`, and `List-Unsubscribe-Post`.
5. Send a test to the named reviewer and obtain approval before production.
6. Choose and document the production time using the timing policy below.
7. Use a production lock and durable per-recipient state. Treat network timeouts and provider 5xx responses as uncertain, not safely retryable.
8. Report accepted, failed, and uncertain counts separately. Do not call accepted messages delivered.
9. Monitor delivery, bounce, spam, unsubscribe, click, conversion, and revenue outcomes; feed them into the next timing decision.

## Timing policy

- Prefer the brand's own conversion and click history by recipient local hour. Opens are secondary because privacy protections can distort them.
- Use at least three comparable campaigns when available. Compare like-for-like campaign type and audience; avoid choosing a time from a single outlier.
- Use recipient-time-zone scheduling when supported. Otherwise use the dominant audience time zone and disclose uncovered regions.
- If historical evidence is insufficient, use a controlled test window rather than claiming a universal optimum. A reasonable starting hypothesis for consumer marketing is Tuesday–Thursday, 9–11 a.m. recipient local time, followed by an A/B timing test.
- Avoid overnight delivery and major holidays unless brand history shows an advantage.
- Schedule rather than send immediately by default. Record the planned timestamp, time zone, evidence, and audience coverage before production approval.
- An explicit instruction such as "critical today," "send now," or a same-day deadline authorizes an urgency override for that campaign only. Record the override and resume scheduled delivery for later campaigns.

## Production gates

- Never send from an unauthenticated brand domain.
- Never bypass provider suppressions or omit a brand-specific unsubscribe group for marketing mail.
- Never reuse one brand's unsubscribe group for another brand.
- Never send production as part of a test/preparation command.
- Never retry recipients whose last state is queued or uncertain until provider activity is reconciled.
- Never expose credentials, subscriber addresses, consent evidence, or physical mailing addresses in logs or chat.

## Handoff

State the selected schedule and why, the consented/suppression-adjusted audience size, test status, production approval state, and whether counts are accepted or delivered. If an urgency override was used, say so explicitly.
