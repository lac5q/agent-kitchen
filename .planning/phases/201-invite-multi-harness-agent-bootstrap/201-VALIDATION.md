# Phase 201: Invite + Multi-Harness Agent Bootstrap — Validation

**Phase:** 201-invite-multi-harness-agent-bootstrap  
**Created:** 2026-07-31  
**Updated:** 2026-07-31T23:10:00Z  
**Source:** `201-RESEARCH.md` § Validation Architecture + `201-01-PLAN.md` `<verification>`  
**Document version:** 1.1  
**Nyquist:** enabled (default when `workflow.nyquist_validation` absent)

---

## Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.3 |
| Fast config | `apps/memroos/vitest.config.ts` (`tagsFilter: ["!slow"]`) |
| Slow config | `apps/memroos/vitest.slow.config.ts` |
| Quick run | `npm test -- --run` |
| Full gate | `npm test -- --run && npm run test:slow -- --run` |

---

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Wave 0 status |
|--------|----------|-----------|-------------------|---------------|
| INVBOOT-01 | Register success → Connect step (no blind login redirect) | manual smoke + source audit | Manual: invite → register → see Connect; source sets `setStep("connect")` | ✅ code + awaiting hermes smoke |
| INVBOOT-02 | Bootstrap returns one command per platform | route (slow) | `npm run test:slow -- --run apps/memroos/src/app/api/onboarding/__tests__/route.test.ts` | ✅ 22/22 slow |
| INVBOOT-03 | Non-localhost URL with public env / forwarded host | unit + route | `npm test -- --run apps/memroos/src/lib/__tests__/public-base-url.test.ts` + slow route | ✅ |
| INVBOOT-04 | Owned token → DB `owner_id` = user | route (slow) | same slow onboarding suite | ✅ |
| INVBOOT-05 | Email draft has 3 steps + inviteUrl | unit | `npm test -- --run apps/memroos/src/lib/__tests__/invite-email-draft.test.ts` | ✅ |
| INVBOOT-06 | Combined coverage | suite | fast helpers + slow onboarding + session-cookies | ✅ phase gate 2026-07-31 |

---

## Wave 0 Gaps (close during execute)

- [x] `apps/memroos/src/lib/__tests__/public-base-url.test.ts` — INVBOOT-03
- [x] Extend `apps/memroos/src/app/api/onboarding/__tests__/route.test.ts` — bootstrap auth, multi-platform mint, owner_id, expired token, reviewer allowed
- [x] `apps/memroos/src/lib/__tests__/invite-email-draft.test.ts` — INVBOOT-05 easy-copy presence
- [x] Extend `apps/memroos/src/app/api/auth/__tests__/session-cookies.test.ts` — register Set-Cookie parity
- [ ] Optional: invite page step-machine unit for INVBOOT-01 (else phase-gate manual smoke on hermes)

---

## Sampling Rate

| Cadence | Commands |
|---------|----------|
| Per task commit | Task 1: public-base-url tests; Task 2: session-cookies + slow onboarding; Task 3: invite-email-draft + public-base-url + slow onboarding |
| Per wave | `npm test -- --run` (touched fast files) && `npm run test:slow -- --run apps/memroos/src/app/api/onboarding/__tests__/route.test.ts` |
| Phase gate | Commands in `201-01-PLAN.md` `<verification>` (all five items) |

---

## Phase-Gate Commands (must pass before SUMMARY)

```bash
npm test -- --run apps/memroos/src/lib/__tests__/public-base-url.test.ts apps/memroos/src/lib/__tests__/invite-email-draft.test.ts
npm test -- --run apps/memroos/src/app/api/auth/__tests__/session-cookies.test.ts
npm run test:slow -- --run apps/memroos/src/app/api/onboarding/__tests__/route.test.ts
```

Plus source audit INVBOOT-01..06 covered, and optional manual smoke: invite → register → Connect → mint → public host in command → DB `owner_id` matches user.

---

## Target host (D-13..D-15)

Eric/Cordant onboarding is **cordant-hermes-01** at
`https://memroos-cordant.epiloguecapital.com` (Cloudflare tunnel `memroos-cordant`,
live 2026-07-31). Phase-gate manual smoke and invites use hermes Team UI — not
`memroos.epiloguecapital.com`.

## Execute ordering note

Tasks in `201-01-PLAN.md` must run **1 → 2 → 3** (Task 2/3 depend on Task 1 artifacts: `resolvePublicMemroosUrl`, `ownerUserId`, `registerAgent` `owner_id`).
