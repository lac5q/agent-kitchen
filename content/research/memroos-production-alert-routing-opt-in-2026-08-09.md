---
name: MemroOS production alert-routing RCA and OAuth verification
description: Root-cause analysis and live verification for legacy monitor email routing and Cordant Google OIDC.
model: gpt-5.6
sources:
  - /home/lac5q/github/memroos-product/scripts/memroos-scheduler-liveness.sh
  - /home/lac5q/github/memroos-product/scripts/memroos-health-check.sh
  - /home/lac5q/github/memroos-product/scripts/host-profiles/cordant-hermes-01.env
  - /home/lac5q/github/memroos-product/scripts/host-profiles/oracle-1.env
  - live SSH checks on cordant-hermes-01 and oracle-1 (2026-08-09)
  - public checks for memroos-cordant.epiloguecapital.com and memroos.epiloguecapital.com
derived_from: production alert-routing RCA and live deployment verification
regen_prompt: Re-run the host profile, cron, health, liveness, and public OAuth checks without printing credentials.
---

# MemroOS production alert-routing RCA and OAuth verification — 2026-08-09

## RCA

The unwanted monitor emails were enabled by an implicit legacy recipient. The scheduler-liveness script defaulted to `luis@epiloguecapital.com`, while both host profiles also declared that alias as `ALERT_EMAIL`. That alias can forward into the Cordant operator mailbox, making host monitor failures look like MemroOS application notification floods. The Main-Mac SendGrid sink had already been contained; the production host fallback remained an independent route.

## Fix

- Removed the scheduler's implicit legacy-recipient fallback; SendGrid delivery now requires an explicit `MEMROOS_ALERT_EMAIL`.
- Set tracked Cordant and Oracle host profiles to `ALERT_EMAIL=` (local health logs and syslog remain active).
- Updated both root-owned production host profile copies, retaining dated rollback backups.
- Added a regression test proving that even with fake SendGrid credentials, an unarmed monitor does not invoke SendGrid without an explicit recipient.
- Source commit: `b21241df`; documentation checkpoint: `fe8641ff`.

## Verification

- Cordant and Oracle source checkouts: `fe8641ff`, clean and tracking `origin/main`.
- Cordant: `MEMROOS_ALERT_EMAIL=unset`; health check exit 0; liveness exit 0.
- Oracle: `MEMROOS_ALERT_EMAIL=unset`; health check exit 0; liveness exit 0.
- Public onboarding verifier: both hosts return expected invalid-token `403` responses and public health `200`.
- Cordant Google OIDC status: `{"configured":true,"reason":null}`.
- Cordant OAuth start: HTTP `302` to Google with redirect URI `https://memroos-cordant.epiloguecapital.com/api/auth/google/callback`.
- Cordant `/forgot-password`: HTTP `200`.

No credentials, access tokens, or secret values are included in this artifact.


## Follow-up validation

The scheduler regression suite now covers both sides of the contract: no implicit SendGrid call when the recipient is unset, and a positive explicit-recipient case that verifies the configured address reaches the stubbed SendGrid request. The test suite reports 8/8 scheduler checks green. The latest source checkout commit is `9cccf28a`; production runtime behavior is unchanged from `b21241df`.


## Independent release review

Claude Code `claude -p --model fable --effort high --permission-mode plan` returned **APPROVE** after reviewing the exact shell contract and live verification facts. A prior review attempt was discarded because the shell-quoted prompt expanded a literal variable before reaching the reviewer; no code decision relied on that malformed prompt.


## Checkpoint update

After the independent review, the source and both host checkouts advanced to `f349cc12` (documentation-only refresh of the validation checkpoint); runtime health and routing behavior are unchanged and were rechecked on both hosts.
