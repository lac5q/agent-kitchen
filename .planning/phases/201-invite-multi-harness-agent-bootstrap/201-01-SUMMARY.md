---
phase: 201-invite-multi-harness-agent-bootstrap
plan: 01
subsystem: auth
tags: [onboarding, invite, bootstrap, owner_id, cookies, public-url]

requires:
  - phase: 199-auth-revocation-integrity
    provides: Session/auth register + invite foundations
provides:
  - resolvePublicMemroosUrl for non-localhost command hosts
  - POST /api/onboarding/bootstrap multi-harness mint with ownerUserId
  - Invite Option A Connect → commands → done step machine
  - Team copyable 3-step email draft (no SendGrid)
  - registerAgent optional owner_id from signed token only
affects: [eric-cordant-onboarding, team-invites, agent-ownership]

tech-stack:
  added: []
  patterns:
    - Public URL resolution prefers env then x-forwarded-host over localhost request URL
    - Bootstrap ownerUserId from session only; register ownerId from HMAC payload only
    - Invitee register sets HttpOnly cookies like login while keeping JSON accessToken for same-page Bearer mint

key-files:
  created:
    - apps/memroos/src/lib/public-base-url.ts
    - apps/memroos/src/lib/invite-email-draft.ts
    - apps/memroos/src/app/api/onboarding/bootstrap/route.ts
  modified:
    - apps/memroos/src/lib/agent-onboarding.ts
    - apps/memroos/src/lib/agent-registry.ts
    - apps/memroos/src/app/api/auth/register/route.ts
    - apps/memroos/src/app/invite/[token]/page.tsx
    - apps/memroos/src/app/team/page.tsx

key-decisions:
  - "ownerId stays optional on registerAgent to avoid breaking A2A/manual callers"
  - "GitNexus MCP unavailable this session — impact/detect_changes skipped with note"
  - "Cline path test forces sys.platform via sitecustomize so Linux/macOS branches work on Darwin hosts"

patterns-established:
  - "Pattern: authenticated self-service bootstrap at /api/onboarding/bootstrap (reviewer allowed, not operator-only)"
  - "Pattern: post-register invite step machine must not re-validate consumed invite once past register"

requirements-completed:
  - INVBOOT-01
  - INVBOOT-02
  - INVBOOT-03
  - INVBOOT-04
  - INVBOOT-05
  - INVBOOT-06

duration: ~90min
completed: 2026-07-31
---

# Phase 201: Invite + Multi-Harness Agent Bootstrap Summary

**Invitee account create → Connect harnesses → public-URL curl|bash commands owned by the new user, plus Team copyable email draft**

## Performance

- **Duration:** ~90 min (execute continuation after plan/research)
- **Started:** 2026-07-31T22:00:00Z (approx)
- **Completed:** 2026-07-31T23:10:00Z
- **Tasks:** 3/3
- **Files modified:** 16 production + planning/docs

## Accomplishments

- Public MemRoOS URL helper so minted commands never embed localhost when a public host/env is known
- Bootstrap API mints one 60m command per selected platform with `ownerUserId` from session
- Invite UI Option A: register → Connect → commands → done/skip (no blind login redirect)
- Team success panel shows copyable 3-step email draft including invite URL
- Phase-gate fast + slow tests green (9 fast + 22 slow onboarding)

## Task Commits

1. **Task 1: Public URL + ownership plumbing** - `01a9c9a7` (feat)
2. **Task 2: Bootstrap API + register cookies** - `7456380b` (feat)
3. **Task 3: Invite Connect UX + Team email draft** - `d1f89850` (feat)

**Plan metadata:** (this SUMMARY + STATE/ROADMAP/VALIDATION commit)

## Files Created/Modified

- `apps/memroos/src/lib/public-base-url.ts` — D-11 public URL resolver
- `apps/memroos/src/app/api/onboarding/bootstrap/route.ts` — multi-platform mint
- `apps/memroos/src/app/invite/[token]/page.tsx` — Connect step machine
- `apps/memroos/src/lib/invite-email-draft.ts` — Team email draft builder
- `apps/memroos/src/lib/agent-registry.ts` — optional `owner_id` + COALESCE
- `apps/memroos/src/app/api/auth/register/route.ts` — Set-Cookie parity with login
- `docs/production-deployment.md` — cordant-hermes public URL (ops, prior/same day)

## Decisions Made

- Kept `ownerId` optional on `registerAgent` (HIGH blast-radius callers; Pitfall 7)
- GitNexus tools not registered in this Cursor MCP session — proceeded with code-review judgment; re-run `impact`/`detect_changes` when GitNexus is available
- Lane: **director-inline** (auth/security-sensitive; MiniMax not used)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Blocking] Cline onboarding path test failed on macOS hosts**
- **Found during:** Phase gate (slow onboarding suite)
- **Issue:** Linux case asserted `.config/...` but host Python `sys.platform` was `darwin`, so script wrote under `Library/Application Support`
- **Fix:** Force `sys.platform` via sitecustomize for both linux and darwin iterations
- **Files modified:** `apps/memroos/src/app/api/onboarding/__tests__/route.test.ts`
- **Verification:** `npm run test:slow -- --run …/onboarding/__tests__/route.test.ts` → 22 passed
- **Committed in:** `7456380b` (Task 2)

---

**Total deviations:** 1 auto-fixed (blocking test host-OS assumption)
**Impact on plan:** No product scope change; test correctness only

## Issues Encountered

- GitNexus MCP unavailable (`impact` / `detect_changes` not callable) — documented; code kept `ownerId` optional
- Vitest missing until local `npm install` during execute

## User Setup Required

None for code. **Deploy/smoke for Eric:**

1. Pull/build/restart memroos on **cordant-hermes-01**
2. Confirm `MEMROOS_PUBLIC_BASE_URL` / APP / BASE URLs = `https://memroos-cordant.epiloguecapital.com`
3. Manual smoke: Team invite → register → Connect → mint → command host is cordant URL; DB `owner_id` set
4. Invite Eric from hermes Team UI using the email draft

## Next Phase Readiness

- Code complete for INVBOOT-01..06; ready for hermes deploy + Eric invite
- Optional follow-up: invite page unit test for Connect step; GitNexus impact re-check when index MCP is live
- **Phase 202** drafted for Claude Cowork remote MCP (CEO/workers; Cloudflare UI live, public `/mcp` still open) — see `.planning/phases/202-claude-cowork-remote-mcp/202-CONTEXT.md`

---
*Phase: 201-invite-multi-harness-agent-bootstrap*
*Completed: 2026-07-31*
