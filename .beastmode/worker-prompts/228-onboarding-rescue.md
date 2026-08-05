# TASK: Phase 228 — Onboarding Rescue (ONBRESCUE-01..05)

Read the full plan first: .planning/phases/228-onboarding-rescue/228-01-PLAN.md
Background RCA: .planning/STATE.md section "Latest Position (2026-08-04 goal run)".

Implement all five requirements exactly as the plan specifies:

1. ONBRESCUE-01 — workspace name from config. Add `resolveWorkspaceName()` (suggested home:
   apps/memroos/src/lib/instance.ts, or extend lib/env.ts if that fits repo convention better):
   MEMROOS_WORKSPACE_NAME env → else capitalized first hostname label of the public base URL
   (e.g. "memroos-cordant.epiloguecapital.com" → "Memroos-cordant" is ugly; prefer first label
   before the first dot, title-cased on the first character only) → else "MemRoOS".
   Thread through buildInviteEmailDraft/buildInviteEmailHtml in
   apps/memroos/src/lib/email/invite-email-draft.ts via a new options field `workspaceName`;
   resolve it at the call sites (grep for buildInviteEmailDraft / buildInviteEmailHtml usages,
   including apps/memroos/src/app/api/auth/invite/route.ts and any Team UI draft endpoint).
   The hardcoded string "(Cordant)" must be gone. Update .env.example with
   MEMROOS_WORKSPACE_NAME and a one-line comment.

2. ONBRESCUE-02 — mint-time URL validation in apps/memroos/src/lib/agent/onboarding.ts:
   add `assertMintableUrl(raw: string, label: string)` — must parse with new URL(); reject
   commas, whitespace, embedded credentials; reject hostnames where the registrable host string
   appears twice (doubled-host corruption, e.g. "a.com,a.com" or "a.coma.com" — detect by
   checking hostname.includes(hostname-of-a-second-URL-parse) is fine, simplest robust check:
   hostname must not contain a comma and must match /^[a-z0-9.-]+$/i and must not contain the
   same dot-separated suffix twice consecutively); require protocol https: unless hostname is
   localhost/127.0.0.1/::1. Throw a typed OnboardingMintError with a clear message. Call it for
   memroosUrl and the resolved mcpUrl inside createAgentOnboardingToken. Update the bootstrap
   route (apps/memroos/src/app/api/onboarding/bootstrap/route.ts) and invite route to catch
   OnboardingMintError and return 500 with { ok:false, error } naming server misconfiguration.

3. ONBRESCUE-03 — signing-key id diagnostics in the same onboarding.ts:
   kid = sha256(signingSecret()).digest hex slice(0,8). Include `kid` in the payload at mint.
   On signature verification failure, when the decoded (unverified) payload parses and carries
   a kid, return error string:
   `Invalid onboarding token signature (token kid <payloadKid>, server kid <serverKid>)`;
   otherwise keep the existing message. The kid is one-way derived and 8 hex chars — safe to
   expose; never expose the secret itself.

4. ONBRESCUE-04 — extend scripts/verify-onboarding-deploy.sh: accept optional host args
   (default both https://memroos.epiloguecapital.com and
   https://memroos-cordant.epiloguecapital.com); for each, assert ?token=bad returns 403 and
   report the distinction between "Invalid onboarding token" (good) and
   "Invalid onboarding token signature" (secret mismatch — explain the kid diagnostics).
   Keep it curl-based, no new dependencies.

5. ONBRESCUE-05 — production boot assertion: in the bootstrap and invite mint paths, when
   process.env.NODE_ENV === "production" and none of MEMROOS_PUBLIC_BASE_URL /
   MEMROOS_APP_URL / MEMROOS_BASE_URL yielded a non-localhost URL (i.e. resolvePublicMemroosUrl
   fell back to headers), record a NOC Attention-style warning. Find the existing attention/
   receipt producer pattern (grep "Attention" under apps/memroos/src/lib — follow whatever
   Phase 173-174 NOC attention contract exists, e.g. an attention item or audit entry
   emitter); if a lightweight fit is unclear, write an audit entry via the existing audit
   helper with event_type "onboarding.base_url_fallback" and include the fallback host used.
   Modify resolvePublicMemroosUrl (apps/memroos/src/lib/http/public-base-url.ts) to also
   return which source was used (env vs forwarded-host vs request-origin) — keep the existing
   string-returning signature working (add a second exported function like
   resolvePublicMemroosUrlDetailed) so the ~other call sites stay untouched.

TESTS (all in the nearest __tests__ dirs):
- invite draft/html use workspaceName; no "(Cordant)" literal remains (assert on output).
- assertMintableUrl: happy path, comma host, doubled host, whitespace, http non-localhost
  rejected, localhost http allowed.
- kid: mint/verify round trip carries kid; cross-secret verification failure message contains
  both kids; tampered-body failure keeps generic message.
- boot assertion: mocked env produces the audit/attention record; configured env does not.
Also update apps/memroos/src/app/api/onboarding/__tests__/route.test.ts expectations if the
signature-error message change breaks them (it asserts the old message at line ~702) — keep
that test meaningful (it uses same-secret tampering, so the generic message path should still
apply; verify).
