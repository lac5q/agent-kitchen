---
title: GSD Beastmode Session — Cordant Separation, Trunk Reconciliation, Cross-Tenant Revoke RCA
date: 2026-08-25
model: claude-opus (director) + claude-sonnet (8 pinned executors)
sources:
  - .planning/ROADMAP.md (reconcile/land-tenant-sep)
  - apps/memroos/src/app/api/onboarding/revoke/route.ts
  - git branch analysis across main / origin/main / codex/* / claude/*
derived_from: beastmode director/executor run, session 01AP5fAQ
regen_prompt: "Re-run the branch reconciliation map and separation custody verifier; re-audit onboarding/revoke for tenant scoping."
tags: [tenant-separation, security, rca, gsd-roadmap, beastmode]
---

# GSD Beastmode Session — 2026-08-25

Director (Opus) + 8 pinned Sonnet executors. All work isolated on branches;
no production host written to without operator authorization.

## 1. RCA — cross-tenant onboarding-invite revocation (HIGH, fixed on branch)

**Gap.** On the reconciled trunk, `POST /api/onboarding/revoke` authorized its
privileged path on role alone (`session.role === "admin" || "operator"`).
`onboarding_token_nonces` carries no `tenant_id`, and the revoke path made no
tenant check — so an admin/operator in **any** tenant could revoke **any
other** tenant's onboarding invite. A cross-tenant privilege gap in the exact
subsystem tenant isolation is meant to protect. Latent trunk bug (PR #24's
nonce revocation shipped without the gate), not a regression.

**Fix (narrow, no migration).** Gate the privileged non-owner branch on the
caller's tenant matching the invite **owner's current tenant**, resolved fresh
from `users.tenant_id` at revoke time (`resolveOnboardingOwnerTenantId`), never
from the signed token payload (which is mint-time-fixed and could go stale).
Fails closed when the owner row is gone. Chosen over importing the codex
`onboarding_invites` ledger architecture — the owner id is already on the
validated payload, so a fresh join is smaller and current.

**Evidence.** New revoke route test (two tenants, real sqlite + JWTs):
cross-tenant admin/operator → 403 (nonce not consumed); same-tenant → 200;
owner → 200. Teeth-check: stashing the fix turns the cross-tenant tests red,
restoring turns them green. Branch `fix/onboarding-revoke-tenant-gate`.
Follow-up: a dangling invite whose owner user was deleted now fails closed
(revocable only via TTL) — acceptable default.

## 2. Cordant separation (client cordant-hermes-01 vs company memroos-ec-1)

- **Live data plane cleared.** 262 client-agent files under `tenants/cordant/`
  removed from `agent-knowledge` `origin/master` (removal commit had never been
  pushed; now pushed, verified 0 remaining). Operator's own Cordant business
  docs (52, under `content/cordant*`) deliberately kept — they are Epilogue's
  records, not client tenant knowledge.
- **Serving-plane coupling already severed by accident:** `oracle-1` left the
  tailnet (renamed `memroos-ec-1`), so the cross-host MCP forward has no
  backend and Cordant's public `/mcp` is DOWN. Fix is runbook step 6 (repoint
  Cloudflare origin 8766→8765 on cordant-hermes-01) — blocked: the June SSH key
  is rejected on that host; needs the provisioner (Sagi) to re-add the key.
- **Custody gate made provable.** `verify-cordant-knowledge-custody.mjs`
  required evidence to name the retired host `oracle-1`; no truthful collection
  could satisfy it (same class as the cutover checker that passed 14/14 against
  a dead host). Fixed to `memroos-ec-1`; added `--inventory`/`--history-evidence`
  CLI so evidence can actually be supplied.
- **SEP-05 coupling landmine documented:** `registry-seed.ts` DEFAULT_SEED_HOST
  and `runtime-topology.json` still name `oracle-1`, and are compared at runtime
  against `MEMROOS_HOST_ID` — which the LIVE host's `/etc/memroos/*.env` still
  sets to `oracle-1`. Flipping the app constants without the live env first
  would empty the operator's agent registry. Recorded as a coordinated,
  host-access-gated change, not a rename sweep.
- **SEP-02/03 proven on a real host** (the new `cordant-hermes-02` sandbox):
  the tenancy health-check fires on drift (exit 1); Litestream paths resolve
  host-distinct. Production-deploy proof still the final open step.

## 3. Trunk reconciliation (the roadmap was spread across branches)

- `origin/main` (PR #24) was already the reconciled trunk (v8.47–v8.51,
  CIHYG-01 all present); local `main` was 40 behind + 2 unpushed fixes.
- The 8 `codex/*` branches are one stacked lineage, mostly duplicating
  already-shipped v8.47/v8.50 work (competing implementations, 47 conflict
  blocks on belief-staleness). Discarded duplicates; salvaged only net-new:
  context-ref-manifest, vector-evidence. Discarded: pathconf (trunk has
  PATHCONF-01), belief-maintenance, reconnect/receipts (all superseded).
- Assembled + full-suite-verified `ship-candidate` = trunk + 2 fixes +
  separation work + security fix + TESTHYG-01 + 2 salvages. 5086 tests pass,
  0 fail; tree clean. Awaiting operator `ship it` to fast-forward `origin/main`.

## 4. Other fixes
- **TESTHYG-01:** an evals API route test ran unmocked handlers that wrote the
  tracked `memroos.eval.yaml` — and on this machine could clobber the *sibling
  public repo's* copy via the `getRepoRoot()` heuristic. Sandboxed to a tmp dir.
- **Neutral sandbox** stood up on `cordant-hermes-02` (Node 22, full deps,
  MemroOS dev server) — a dev box that is tenant of neither client nor company.

## Blocked on operator authorization (all hard-stops)
Ship the reconciled trunk to `origin/main`; the SEP-05 live env flip and
ONBOARD-GW-01 live-auth wiring (both production/auth); the client `/mcp`
restoration (needs Sagi's key on cordant-hermes-01); the irreversible history
purge of the client documents (separation runbook step 9).
