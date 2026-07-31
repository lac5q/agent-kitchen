# Phase 201: Invite + Multi-Harness Agent Bootstrap - Research

**Researched:** 2026-07-31
**Domain:** Human invite registration handoff + agent onboarding token minting + `registered_agents.owner_id`
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Journey (locked — user chose A)
- **D-01:** Harness selection happens **after** successful registration on the invite flow (same session), not on the admin invite-create form.
- **D-02:** Invitee may select **multiple** harnesses; each gets its own onboarding command.
- **D-03:** After commands are shown, invitee can copy them, mark done, and continue to login (or auto-session if already issued `accessToken`).

#### UX / copy (locked)
- **D-04:** Instructions must be “easy easy” — numbered steps, one command block per harness, no internal jargon (no “HMAC”, “TTL”, “MCP target” in primary copy). Secondary “Advanced” can mention restart the app.
- **D-05:** Primary harness labels human-friendly: Cursor, Claude Code, Codex, Hermes, OpenClaw, Pi, Gemini, Qwen, Droid, Cline, ChatGPT, Grok, OpenCode, ZCode (map to existing platform ids).
- **D-06:** Email draft on Team page is copy-paste text: (1) open invite link (2) create account (3) pick your AI tools and run the one-line commands shown.

#### Auth / ownership (locked)
- **D-07:** After register, client keeps the returned `accessToken` (or uses it) to call a new authenticated bootstrap endpoint that mints onboarding commands — do **not** put long-lived agent keys in the invite URL.
- **D-08:** Agents registered through these commands MUST set `registered_agents.owner_id` to the registering human’s `users.id`.
- **D-09:** Reuse `createAgentOnboardingToken` + `/api/onboarding/script` + `/api/onboarding/register`; extend payload/register path only as needed for `ownerUserId` / `owner_id`.
- **D-10:** Default onboarding token TTL may stay short (15m) **or** be raised for invitee bootstrap (planner discretion, prefer ≤60m with clear “commands expire” copy). Refresh button re-mints while session valid.

#### Public URL (locked)
- **D-11:** Commands must use a public base URL: prefer `MEMROOS_PUBLIC_BASE_URL` / `MEMROOS_APP_URL` if set to a non-localhost value; else request origin / forwarded host. Never mint `http://localhost` commands when a public host header is present.

#### Email (locked)
- **D-12:** v1 = **copyable draft only** on Team after invite generate. No SendGrid in this phase.

### Claude's Discretion
- Exact route shape (`POST /api/onboarding/bootstrap` vs nested under `/api/auth/...`)
- Whether welcome lives as step state on `/invite/[token]` vs `/welcome` redirect
- Agent id naming scheme (e.g. `{slug}-{platform}` vs generated `agt_…`) as long as ids are unique and stable per user+platform
- Whether to show “Skip for now” on harness step
- Test file placement matching existing auth/onboarding suites

### Deferred Ideas (OUT OF SCOPE)
- SendGrid live invite mail
- Admin-side harness preselection (option B)
- oracle-1 `.env` PUBLIC_BASE_URL fix (ops)
- In-app “my agents” ownership dashboard polish beyond what’s needed to verify owner_id
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INVBOOT-01 | Invitee register → Connect agents step (not login-only) | Invite page step machine; stop blind `router.push("/login?message=account-created")` |
| INVBOOT-02 | Multi-select harnesses → one command per harness | New bootstrap API + multi-platform mint loop reusing `createAgentOnboardingToken` / `shellQuote` |
| INVBOOT-03 | Commands use public base URL (not localhost when public host known) | Shared `resolvePublicMemroosUrl(request)` helper; D-11 priority order |
| INVBOOT-04 | Registered agents persist `owner_id` = invitee user id | Token `ownerUserId` → onboarding register → `registerAgent` INSERT/UPDATE |
| INVBOOT-05 | Team page shows copyable 3-step email draft after invite create | Client-only draft from `inviteUrl` on Team success panel |
| INVBOOT-06 | Tests cover bootstrap mint + owner_id + easy copy presence | Extend slow onboarding route suite + fast helper/unit tests |
</phase_requirements>

## Summary

Phase 201 stitches two existing systems that today never meet: human team invites (`/invite/[token]` → `/api/auth/register`) and agent onboarding (`createAgentOnboardingToken` → `/api/onboarding/script` → `/api/onboarding/register` → `registerAgent`). The invite page currently discards the returned `accessToken` and redirects to login. `registerAgent` and the onboarding register route never write `owner_id`, even though the column and the `onboardUser` lifecycle path already know how.

No new npm packages are required. The work is additive: a post-register Connect step on the invite page, a self-service authenticated mint endpoint, a signed `ownerUserId` field on onboarding tokens, persistence of `owner_id` in `registerAgent`, a shared public-URL resolver, and a copy-only email draft on Team.

**Primary recommendation:** Keep step state on `/invite/[token]` after successful register; add `POST /api/onboarding/bootstrap` (any authenticated user) that mints one command per selected platform with `ownerUserId = session.userId`; thread that id through token verify → `registerAgent({ ownerId })`; resolve URLs via a shared non-localhost helper; add Team email draft as pure UI.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Invite account create UI + Connect step | Browser / Client | Frontend Server (SSR) | Client page already owns invite form; multi-step state is session-local |
| Team email draft copy | Browser / Client | — | Draft from already-returned `inviteUrl`; no mail API |
| Human invite mint / consume | API / Backend | Database / Storage | Existing `/api/auth/invite` + `/api/auth/register` + `team_invitations` |
| Bootstrap command mint | API / Backend | — | Must bind `ownerUserId` from authenticated session, not client body |
| Onboarding token sign/verify | API / Backend | — | Existing HMAC helpers in `agent-onboarding.ts` |
| Agent register + `owner_id` persist | API / Backend | Database / Storage | `/api/onboarding/register` + `registerAgent` + SQLite |
| Public base URL selection | API / Backend | CDN / Static (host headers) | Env + forwarded host; never trust client `memroosUrl` for invitee bootstrap |
| Bootstrap shell install | Client machine (agent host) | API / Backend | Existing script endpoint; unchanged contract aside from owned tokens |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | `^16.2.7` in `apps/memroos` [VERIFIED: package.json] | Invite/Team pages + API routes | Existing operator app |
| Vitest | `^4.1.3` [VERIFIED: package.json] | Unit/route tests; fast vs slow tag split | Existing suite pattern |
| jose | `^5.10.0` [VERIFIED: package.json] | Human `accessToken` JWT | Already used by `signAccessToken` |
| Node `crypto` HMAC | built-in | Agent onboarding tokens | Existing `agent-onboarding.ts` |
| better-sqlite3 via `getDb()` | existing | Persist users/agents/invites | Existing data layer |

### Supporting

| Library / Asset | Version | Purpose | When to Use |
|-----------------|---------|---------|-------------|
| `PLATFORM_LABELS` (`ui-constants.ts`) | existing | Human harness labels | Invitee picker; override `claude` → “Claude Code” for D-05 |
| `shellQuote` / `createAgentOnboardingToken` | existing | Command mint | Bootstrap endpoint |
| `authenticateUser` / `requireRole` | existing | Session auth | Bootstrap: any authenticated role; do **not** require operator |
| Login cookie helpers (`session-limits`, `isHttpsRequest`) | existing | Optional register→cookie parity | Recommended additive for refresh resilience |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `POST /api/onboarding/bootstrap` | Extend `POST /api/onboarding/invite` | Invite requires operator/operator-key; invitee reviewers would get 403. Separate route is cleaner. |
| Step state on `/invite/[token]` | Dedicated `/welcome` page | Welcome survives refresh better if cookies set; more routing surface. Prefer invite steps + cookie set as recovery. |
| Token-embedded `ownerUserId` | Client-supplied `owner_id` on register body | Client body is forgeable; signed token is the trust boundary (D-07/D-08). |
| New email provider | Copyable draft | Locked out (D-12). |

**Installation:**

```bash
# No new packages. Reuse existing apps/memroos stack.
```

**Version verification:** No new registry packages for this phase. Existing deps confirmed from `apps/memroos/package.json` on 2026-07-31.

## Package Legitimacy Audit

> No external packages to install for this phase.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| — | — | — | — | — | — | N/A — no installs |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```text
Admin (Team UI)
  │ POST /api/auth/invite
  ▼
inviteUrl ──copy──► Email draft (client-only text)
  │
  ▼
Invitee browser  /invite/[token]
  │ 1) Create account
  │ POST /api/auth/register  → { accessToken, userId }
  │    (marks team_invitations.used_at)
  │ 2) Connect step (multi-select platforms)
  │ POST /api/onboarding/bootstrap
  │    Authorization: Bearer <accessToken>
  │    body: { platforms: ["cursor","claude",...] }
  ▼
createAgentOnboardingToken({
  memroosUrl: resolvePublicMemroosUrl(req),
  defaultPlatform,
  allowedAgentIds: ["{userShort}-{platform}"],
  ownerUserId: session.userId,   // NEW signed claim
  ttlSeconds: 3600
})
  │ returns commands[]
  ▼
Invitee Terminal (per harness)
  curl …/api/onboarding/script?token=… | bash -s -- --id … --platform …
  │
  ▼
POST /api/onboarding/register
  verify token → read ownerUserId
  registerAgent({ …, ownerId: payload.ownerUserId })
  ▼
registered_agents.owner_id = users.id
```

### Recommended Project Structure

```
apps/memroos/src/
├── app/invite/[token]/page.tsx          # multi-step: register → connect → commands → done
├── app/team/page.tsx                      # email draft after inviteUrl
├── app/api/auth/register/route.ts         # optional: Set-Cookie like login
├── app/api/onboarding/bootstrap/route.ts  # NEW: authenticated multi-platform mint
├── app/api/onboarding/register/route.ts   # pass ownerId from token
├── lib/agent-onboarding.ts                # ownerUserId on payload + create input
├── lib/agent-registry.ts                  # persist owner_id
├── lib/public-base-url.ts                 # NEW: resolvePublicMemroosUrl
├── lib/ui-constants.ts                    # label tweak Claude → Claude Code (or invite-local map)
├── types/index.ts                         # RegisterAgentInput.ownerId?
└── app/api/onboarding/__tests__/route.test.ts  # extend (slow)
```

### Exact files / functions to change (INVBOOT-01 option A)

| File | Change |
|------|--------|
| `apps/memroos/src/app/invite/[token]/page.tsx` | After successful register: keep `accessToken`/`userId` in state; advance to Connect step; multi-select harnesses; call bootstrap; show numbered command blocks; Done → login or console; Skip optional |
| `apps/memroos/src/app/api/onboarding/bootstrap/route.ts` | **NEW** `POST` handler |
| `apps/memroos/src/lib/agent-onboarding.ts` | Add optional `ownerUserId` to `CreateAgentOnboardingTokenInput` + `AgentOnboardingTokenPayload` |
| `apps/memroos/src/app/api/onboarding/register/route.ts` | After verify, pass `ownerId: verified.payload.ownerUserId` into `registerAgent` |
| `apps/memroos/src/lib/agent-registry.ts` → `registerAgent` | INSERT/UPDATE `owner_id`; optional `ownerId` on input |
| `apps/memroos/src/types/index.ts` → `RegisterAgentInput` | Add optional `ownerId?: string` |
| `apps/memroos/src/lib/public-base-url.ts` | **NEW** shared resolver used by bootstrap (and optionally invite) |
| `apps/memroos/src/app/team/page.tsx` | After `inviteUrl` shown, render copyable 3-step email draft |
| `apps/memroos/src/app/api/auth/register/route.ts` | **Recommended:** also set `access_token` (+ refresh) cookies like login so Done can auto-session (D-03) |
| `apps/memroos/src/lib/ui-constants.ts` | Align `claude` label to “Claude Code” for D-05 (or local INVITEE_PLATFORM_LABELS) |

**Do not change for v1:** `/api/onboarding/script` body (flags already support `--id` / `--platform`); admin invite-create form harness preselection (option B deferred).

### Pattern 1: Authenticated multi-platform bootstrap mint

**What:** Any logged-in user mints short-lived per-platform onboarding commands bound to their `userId`.
**When to use:** Post-register Connect step only (not operator bulk invite).
**Example:**

```typescript
// Source: apps/memroos/src/app/api/onboarding/invite/route.ts (command shape)
// Adapt for bootstrap: auth = authenticateUser only; owner from session.
const session = await authenticateUser(request);
if (!session) return Response.json({ error: "authentication required" }, { status: 401 });
// Do NOT requireRole(session.role, "operator") — invitees are often reviewers.

const memroosUrl = resolvePublicMemroosUrl(request);
const ttlSeconds = 60 * 60; // D-10: invitee bootstrap ≤60m

const commands = platforms.map((platform) => {
  const agentId = `${session.userId.slice(0, 8)}-${platform}`;
  const { token, payload } = createAgentOnboardingToken({
    memroosUrl,
    ttlSeconds,
    allowedAgentIds: [agentId],
    defaultPlatform: platform,
    defaultProtocol: "rest",
    ownerUserId: session.userId, // NEW
  });
  const command = `curl -fsSL ${shellQuote(
    `${payload.memroosUrl}/api/onboarding/script?token=${encodeURIComponent(token)}`
  )} | bash -s -- --id ${shellQuote(agentId)} --platform ${shellQuote(platform)} --mcp-target 'auto'`;
  return { platform, label: PLATFORM_LABELS[platform] ?? platform, agentId, command, expiresAt: new Date(payload.exp * 1000).toISOString() };
});
```

### Pattern 2: Trust owner only from signed token

**What:** `ownerUserId` is part of HMAC payload; register route never accepts client `ownerId`.
**When to use:** Always for invitee-owned agents.
**Example:**

```typescript
// Source: apps/memroos/src/app/api/onboarding/register/route.ts (extend existing)
const verified = verifyAgentOnboardingToken(parsed.token);
if (!verified.ok) {
  return Response.json({ ok: false, error: verified.error }, { status: 403 });
}
const result = registerAgent({
  ...parsed.input,
  ownerId: verified.payload.ownerUserId, // undefined for legacy operator invites → NULL owner_id
  // ...
});
```

### Pattern 3: Public URL resolution (D-11)

**What:** Prefer configured public env URLs; never mint localhost when a public host is known.
**Example:**

```typescript
// Recommended helper: apps/memroos/src/lib/public-base-url.ts
function isLocalhostUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return true;
  }
}

export function resolvePublicMemroosUrl(request: Request): string {
  const candidates = [
    process.env.MEMROOS_PUBLIC_BASE_URL,
    process.env.MEMROOS_APP_URL,
    process.env.MEMROOS_BASE_URL,
  ];
  for (const candidate of candidates) {
    if (candidate && !isLocalhostUrl(candidate)) return candidate.replace(/\/+$/, "");
  }
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return `${proto}://${forwardedHost}`.replace(/\/+$/, "");
  }
  return `${url.protocol}//${url.host}`.replace(/\/+$/, "");
}
```

**Gap today:** `/api/onboarding/invite` uses `originFromRequest` / body `memroosUrl` only — it does **not** prefer `MEMROOS_PUBLIC_BASE_URL`. Team invite uses `MEMROOS_BASE_URL ?? host`. Bootstrap must implement D-11 explicitly. [VERIFIED: codebase]

### Anti-Patterns to Avoid

- **Blind redirect to login after register:** Breaks INVBOOT-01; loses `accessToken`.
- **Requiring operator role on bootstrap:** Invitees with `reviewer` role cannot mint.
- **Accepting `ownerId` from register JSON body:** Spoofable; only signed token claim.
- **Putting agent API keys or long-lived secrets in invite URL:** Forbidden by D-07.
- **Wiping `owner_id` on `ON CONFLICT` re-register:** Preserve existing owner unless new token supplies one.
- **Primary UX jargon:** No “HMAC”, “TTL”, “MCP target” in main copy (D-04). Hide `--mcp-target` behind Advanced or omit from visible primary copy while still including in the command (command must keep `--mcp-target auto` for script compatibility — show the full command in the copy block; keep surrounding prose jargon-free).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Agent onboarding auth | New invite URL agent keys | `createAgentOnboardingToken` | Existing HMAC + script/register pipeline |
| Shell escaping | String concat | `shellQuote` | Quote edge cases already handled |
| Human session | Custom session store | `signAccessToken` + `authenticateUser` | JWT + cookie/Bearer already wired |
| Ownership join | Parallel ownership table | `registered_agents.owner_id` | Column + lifecycle pattern exist |
| Email send | SendGrid client | Copyable draft textarea | D-12 locked |
| Platform list | New platform enum | Existing `PLATFORMS` set in onboarding routes | Out of scope to add platforms |

**Key insight:** This phase is a handoff UI + a thin ownership claim on an already-proven token pipeline — not a new onboarding system.

## Common Pitfalls

### Pitfall 1: Invite already consumed before Connect
**What goes wrong:** After register, `team_invitations.used_at` is set. Refreshing `/invite/[token]` re-validates via GET and shows “Invitation Invalid”, killing the Connect UI.
**Why it happens:** Invite validation runs unconditionally on mount.
**How to avoid:** Once register succeeds in-session, set `phase: "connect" | "commands" | "done"` and **skip** invite re-validation for that mount. Optionally set auth cookies on register and recover via session if remounted. Do not require a valid unused team invite to mint agent commands.
**Warning signs:** Connect step disappears on refresh; bootstrap 401 after refresh with no cookies.

### Pitfall 2: Register returns `accessToken` but sets no cookies
**What goes wrong:** `credentials: "include"` alone cannot authenticate bootstrap; login sets HttpOnly cookies, register currently returns JSON only. [VERIFIED: `register/route.ts` vs `login/route.ts`]
**Why it happens:** Historical asymmetry; invite page never used the token.
**How to avoid:** Client must send `Authorization: Bearer ${accessToken}` (D-07). **Also recommend** mirroring login’s Set-Cookie on register for Done → console without re-login (D-03).
**Warning signs:** Bootstrap 401 despite “successful” register; Done forces login even with token in memory.

### Pitfall 3: Localhost commands in production
**What goes wrong:** Commands embed `http://localhost:3000` when env is mis-set to localhost and proxy headers are ignored.
**Why it happens:** Existing invite mint prefers request origin; oracle-1 may have `MEMROOS_PUBLIC_BASE_URL=localhost` (ops deferred) while Cloudflare forwards a public host.
**How to avoid:** Implement D-11: skip localhost env values; prefer forwarded host over localhost request URL. Test with `x-forwarded-host` like existing onboarding test.
**Warning signs:** Command contains `localhost` while Host/forwarded host is public.

### Pitfall 4: `registerAgent` never writes `owner_id`
**What goes wrong:** INVBOOT-04 fails silently; agents appear unowned; offboard/delegation cannot find them.
**Why it happens:** INSERT column list omits `owner_id`; `RegisteredAgentRow` / `rowToRegisteredAgent` also omit it. [VERIFIED: `agent-registry.ts`]
**How to avoid:** Add optional `ownerId` to input; include in INSERT and `ON CONFLICT` update with `owner_id = COALESCE(excluded.owner_id, registered_agents.owner_id)`.
**Warning signs:** DB row `owner_id IS NULL` after bootstrap register test.

### Pitfall 5: Short TTL vs slow human setup
**What goes wrong:** User selects harnesses, walks away, commands expire (default 15m).
**Why it happens:** Operator invites default to 15 minutes.
**How to avoid:** Invitee bootstrap TTL **60m** (D-10); UI copy “These commands expire in about an hour”; Refresh re-mints while `accessToken`/session valid.
**Warning signs:** Script returns 403 “Onboarding token expired”.

### Pitfall 6: Agent id collisions across users
**What goes wrong:** Two users both run `--platform cursor` without `--id` → slugify(hostname) collision / overwrite.
**Why it happens:** Script defaults `AGENT_ID` from name/host when `--id` omitted.
**How to avoid:** Bootstrap always scopes `allowedAgentIds` and embeds `--id '{userShort}-{platform}'` in the command (discretion recommendation).
**Warning signs:** Second user’s register updates first user’s agent row.

### Pitfall 7: Blast radius of `registerAgent`
**What goes wrong:** Required `ownerId` breaks A2A/manual registration callers.
**Why it happens:** Many call sites (`a2a/card-ingestion`, chatgpt-actions, tests, heartbeat fixtures).
**How to avoid:** Keep `ownerId` **optional**; only onboarding-bootstrap tokens supply it. Run impact/detect_changes at execute time (GitNexus MCP unavailable in this research session).
**Warning signs:** Type errors across unrelated register call sites.

## Code Examples

### Invite page handoff (client)

```tsx
// Source: adapt apps/memroos/src/app/invite/[token]/page.tsx
// After res.ok — do NOT router.push("/login?message=account-created") yet
const data = (await res.json()) as { accessToken: string; userId: string };
setAccessToken(data.accessToken);
setUserId(data.userId);
setStep("connect"); // skip invite re-validate while step !== "register"

// Later mint:
const boot = await fetch("/api/onboarding/bootstrap", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({ platforms: selectedPlatforms }),
});
```

### Team email draft (copy-only)

```tsx
// Source: adapt apps/memroos/src/app/team/page.tsx success panel
const emailDraft = `Hi,

You've been invited to MemRoOS. Three easy steps:

1) Open this invite link and create your account:
${inviteUrl}

2) After your account is created, pick the AI tools you use (Cursor, Claude Code, Codex, and others).

3) Copy each one-line Terminal command shown and run it on your machine. That connects your tools to the MemRoOS server — you still log into the console as yourself.

Questions? Reply to this email.
`;
```

### owner_id persistence (registry)

```typescript
// Source: pattern from apps/memroos/src/lib/identity/lifecycle.ts onboardUser INSERT
// Adapt registerAgent INSERT to include owner_id column (nullable)
// ON CONFLICT: owner_id = COALESCE(excluded.owner_id, registered_agents.owner_id)
```

## State of the Art

| Old Approach | Current Approach (this phase) | When Changed | Impact |
|--------------|-------------------------------|--------------|--------|
| Human invite → login only | Human invite → Connect agents → commands → done | Phase 201 | One continuous journey |
| Operator-only `/api/onboarding/invite` | + self-service `/api/onboarding/bootstrap` | Phase 201 | Reviewers can mint own commands |
| `registerAgent` without owner | Optional `owner_id` from signed token | Phase 201 | Matches `onboardUser` ownership model |
| Team share link only | Link + copyable email draft | Phase 201 | Eric-style easy email |

**Deprecated/outdated:**
- Blind `router.push("/login?message=account-created")` as success path for invitee — replace with Connect step first.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Invitee bootstrap TTL of 60 minutes is acceptable ops/security tradeoff | Pitfall 5 / D-10 | Too long if token leaked; too short if users slow — UI refresh mitigates |
| A2 | Agent id scheme `{first8(userId)}-{platform}` is stable enough | Pattern 1 | Collision if userId entropy truncated poorly (20 hex chars from register — 8 is fine) [ASSUMED acceptable] |
| A3 | Showing full curl command (including `--mcp-target auto`) is OK if surrounding prose stays jargon-free | Anti-patterns / D-04 | Copy may still look “technical”; Advanced/collapse could help |
| A4 | Setting cookies on register is safe/desired alongside returning accessToken | Pitfall 2 | Slightly expands session surface at register; aligns with login CR-01 HttpOnly pattern |

**If this table is empty:** N/A — assumptions listed above need planner confirmation only where marked.

## Open Questions (RESOLVED)

1. **Register Set-Cookie parity?** — **RESOLVED** (Plan 201-01 Task 2): yes — set cookies on register for login parity; Connect step still uses Bearer `accessToken` in the same page session.

2. **Claude label constant change?** — **RESOLVED** (Plan 201-01 Task 1): set `PLATFORM_LABELS.claude = "Claude Code"` (shared constant; Agents UI stays consistent with D-05).

3. **Skip for now?** — **RESOLVED** (Plan 201-01 Task 3): yes — secondary “Skip for now” continues without minting.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | App / tests | ✓ | v26.5.0 | — |
| npm | Scripts | ✓ | 11.17.0 | — |
| Vitest (repo) | INVBOOT-06 | ✓ | ^4.1.3 | — |
| `MEMROOS_JWT_SECRET` | Register/bootstrap auth | env-dependent | — | Required in real runs; tests set secrets |
| `MEMROOS_ONBOARDING_SECRET` | Token sign/verify | env-dependent | — | Falls back to operator key / local-dev string |
| `MEMROOS_PUBLIC_BASE_URL` / `MEMROOS_APP_URL` | INVBOOT-03 | ops-dependent | — | Forwarded host / request origin per D-11 |
| SendGrid | Email send | N/A | — | Out of scope (D-12) |
| GitNexus MCP impact tools | Pre-edit blast radius | ✗ this session | — | Manual caller audit via ripgrep (done) |

**Missing dependencies with no fallback:**
- None for planning/implementation in-repo.

**Missing dependencies with fallback:**
- Production public URL env may be localhost — code must prefer forwarded public host (D-11); ops fix deferred.

## Validation Architecture

> `workflow.nyquist_validation` absent in `.planning/config.json` → treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.3 |
| Config file | `apps/memroos/vitest.config.ts` (fast, `tagsFilter: ["!slow"]`); `apps/memroos/vitest.slow.config.ts` (slow) |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm test -- --run && npm run test:slow -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INVBOOT-01 | Register success advances to connect (no immediate login redirect) | component/unit | `npm test -- --run src/app/invite` (new) | ❌ Wave 0 |
| INVBOOT-02 | Bootstrap returns one command per platform | route (slow) | `npm run test:slow -- --run` | ❌ extend existing |
| INVBOOT-03 | Non-localhost URL with forwarded host / public env | unit + route | `npm test -- --run` (helper) + slow route | ❌ Wave 0 helper |
| INVBOOT-04 | After register via owned token, DB `owner_id` = user | route (slow) | `npm run test:slow -- --run` | ❌ extend onboarding suite |
| INVBOOT-05 | Email draft string contains 3 steps + inviteUrl | component/unit | `npm test -- --run` Team draft helper | ❌ Wave 0 |
| INVBOOT-06 | Combined coverage above | suite | fast + slow | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- --run` (relevant new unit files)
- **Per wave merge:** `npm test -- --run && npm run test:slow -- --run`
- **Phase gate:** Full fast+slow green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/memroos/src/lib/__tests__/public-base-url.test.ts` — covers INVBOOT-03 resolver cases
- [ ] Extend `apps/memroos/src/app/api/onboarding/__tests__/route.test.ts` — bootstrap auth, multi-platform mint, owner_id persistence, expired token, reviewer role allowed
- [ ] Optional: `apps/memroos/src/app/invite/[token]/__tests__/page.test.tsx` — step machine / no blind login redirect
- [ ] Optional: Team draft pure function test for INVBOOT-05 copy presence
- [ ] No framework install needed

**Existing pattern to mirror:** Onboarding suite uses temp SQLite, `vi.resetModules()`, operator key header, asserts command URL + register + 403 on bad token; tagged `{ tags: ["slow"] }`. [VERIFIED: route.test.ts]

**Auth test note:** No dedicated `/api/auth/register` route test file today; session/cookie coverage lives in `session-cookies.test.ts` (login/refresh). If register gains Set-Cookie, add cases beside that file rather than inventing a parallel harness.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `authenticateUser` Bearer/cookie JWT for bootstrap; existing register invite gate |
| V3 Session Management | yes | Prefer HttpOnly cookies on register; do not expose refresh in invite URL |
| V4 Access Control | yes | Bootstrap binds `ownerUserId` to session; register trusts signed token only; no operator role required for self-mint |
| V5 Input Validation | yes | Platforms whitelist (`PLATFORMS` set); reject unknown platforms; cap platform array size |
| V6 Cryptography | yes | Existing HMAC onboarding tokens + jose JWT — never hand-roll |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forge owner_id on register | Elevation / Spoofing | `ownerUserId` only inside HMAC token; ignore body field |
| Steal bootstrap JWT from XSS | Info disclosure | Prefer HttpOnly cookie; minimize token in JS state duration; short onboarding TTL |
| Replay expired onboarding token | Tampering | Existing `exp` check → 403 |
| Mint commands as another user | Elevation | `ownerUserId` from `session.userId` only |
| Localhost command exfil / mis-route | Tampering | D-11 public URL resolver |
| Team invite reuse after register | Elevation | Already consumed; Connect must not depend on unused invite |
| Open redirect via memroosUrl body | Tampering | Bootstrap: ignore client memroosUrl; use resolver only |

## Project Constraints (from .cursor/rules/)

No `.cursor/rules/` directory present in this workspace at research time. Follow repo `AGENTS.md` / `CLAUDE.md`: Next.js 16 docs under `node_modules/next/dist/docs/` before novel Next APIs; GitNexus impact before symbol edits at execute time; fast vs slow Vitest split for new slow tests.

## Discretion Recommendations (for planner)

| Topic | Recommendation | Rationale |
|-------|----------------|-----------|
| Route shape | `POST /api/onboarding/bootstrap` | Same family as script/register; distinct auth from operator invite |
| Welcome UX | Step state on `/invite/[token]` + register Set-Cookie | Minimal new routes; refresh recovery via session |
| Agent ids | `{userId.slice(0,8)}-{platform}` + `allowedAgentIds` | Unique per user+platform; script-safe |
| Skip | Show “Skip for now” | Matches D-03 escape hatch |
| TTL | 60 minutes for bootstrap; keep operator invite default 15m | D-10 |
| Tests | Extend slow onboarding route tests; fast unit for URL helper | Matches existing suite split |

## Sources

### Primary (HIGH confidence)
- Codebase reads: invite page, register/login routes, `agent-onboarding.ts`, onboarding invite/register/script, `agent-registry.ts`, `identity/lifecycle.ts`, Team page, `ui-constants.ts`, onboarding `__tests__/route.test.ts`, `docs/rest-api.md`, `docs/production-deployment.md`, `201-CONTEXT.md`, ROADMAP INVBOOT table
- `apps/memroos/package.json` version pins (Next, Vitest, jose)

### Secondary (MEDIUM confidence)
- Vitest Context7 library resolution (`/vitest-dev/vitest`) — used only to confirm ecosystem currency; phase does not change Vitest APIs

### Tertiary (LOW confidence)
- GitNexus formal impact graph — MCP tools not available this session; caller list from ripgrep only

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — reuse-only; versions verified from package.json
- Architecture: HIGH — all integration points read in-repo; locked decisions constrain design
- Pitfalls: HIGH — invite consume, cookie asymmetry, owner_id gap, localhost mint verified in code

**Research date:** 2026-07-31
**Valid until:** 2026-08-30 (stable internal API surface; re-check if onboarding token schema version bumps)
