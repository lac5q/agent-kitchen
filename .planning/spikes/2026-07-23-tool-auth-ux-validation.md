# Tool Authentication UX for Memroos — Validation Report

**Date:** 2026-07-23
**Validator:** Claude Opus 4.8 (via Claude Pro lane, `~/.local/bin/claude-pro`)
**Subject:** `.planning/spikes/2026-07-23-tool-auth-ux-research.md`
**Contract:** `.beastmode/GOAL_STATE.tool-auth-ux.md`

---

## Verdict: REVISE

The direction is defensible; the reasoning has real holes. Headline findings:

**Strongest finding — an internal contradiction that breaks the license case both ways.** The spike calls memroos "local-first, single-tenant" to wave away Nango's Elastic License v2 managed-service clause, but in the ToolJet row it rejects AGPL *because "memroos is a hosted SaaS option."* You can't have both: if memroos is a hosted SaaS bundling Nango's features, ELv2's managed-service clause is a **live** risk (not the non-issue claimed); if it's pure self-host, AGPL for ToolJet is far less scary. This must be resolved before either license verdict stands.

**Recommendation soundness:**
- Nango's self-host stack (server + workers + Postgres + Redis) is the **heaviest** option in the survey and fights memroos's own "single-binary/single-container" model — undersold.
- memroos is MCP-first, and Nango is rated "not first-class MCP," while the MCP-native options (Composio, Arcade, and the missed **Klavis**) are the ones dismissed. Nango wins on catalog size, not on memroos's actual axis.
- The Nango **API key** Luis set up is a *hosted* signal, but the rec is built on *self-host*; hosted Nango means third-party tokens live at `api.nango.dev`, contradicting the local-vault custody model. The hosted-vs-self-host split is treated as a footnote when it changes which risk you accept.
- **Better Auth = MIT: confirmed.**

**Coverage gaps:** Descope Outbound Apps / Stytch Connected Apps / Scalekit (building *exactly* agent-tool OAuth — more on-target than the WorkOS/Clerk/Auth0 included "for completeness") and OSS+MCP-native **Klavis** (arguably a better primary than Nango) are all missing. Composio's license-shift question the contract explicitly asked went unanswered.

**Factual flags (deferring to fresh data where warranted):** "Auth.js now part of Better Auth" is a striking claim to verify; "self-host Nango = limited catalog" is likely wrong (providers.yaml is open); the "308-redirect" callback framing is technically shaky.

**Roadmap block:** Format/numbering check out against real v8.18/v8.22 entries (Phase 179, v8.23, Source-opinion citing both files — all correct; dependencies FLEET-22/176/178 and the vault path verified locally). But: criterion 1's 10-provider hard gate is over-scoped for one phase; OAuth-only-vs-hybrid is silently pre-decided (contract says it's open); `TOOLAUTH-01..06` are undefined; and the block hard-codes the Nango/Better-Auth pick the spike hasn't earned yet.

Fixes are additive, not a teardown — hence REVISE rather than REJECT.

---

## Factual accuracy

| Cell in spike | Claim | Validator's check | Action |
|---|---|---|---|
| Composio license | MIT | Confirmed via LICENSE file (Copyright (c) 2025 Sampark Inc.) | OK |
| Composio stars | 29.3k | OK; 890 releases; last push 2026-07-20 | OK |
| Nango license | Elastic License v2 | Confirmed; the "Elastic License v2 prohibits managed service" reading is **correct but the spike treats it as non-issue, which contradicts the memroos-as-SaaS concern applied to ToolJet's AGPL** | **Resolve the contradiction** (see Recommendation soundness) |
| Nango self-host "limited catalog" | "Cloud/Enterprise Self-Hosted versions give you access to all features" | Likely **wrong** — Nango's `providers.yaml` is open and the catalog is open-source; the "free self-host" limitation is usually operational, not catalog | Soften the claim |
| Nango callback URL | "308-redirect to api.nango.dev" | The 308-redirect is one option; Nango also supports custom callback domains with their own SSL — confirm current docs | Soften |
| Arcade arcade-mcp | MIT, 953 stars | Confirmed via PyPI (License: MIT, Copyright (c) 2025 Arcade AI) | OK |
| Arcade "managed auth runtime is closed-source Arcade Cloud" | Composio/Arcade | True for Arcade Cloud; not the only option — standalone mode + 21 OAuth providers in TS SDK is local | Tighten wording |
| Pipedream license | "Pipedream Source Available License (not OSI)" | Confirmed via 2022 blog post re-license | OK |
| n8n | Sustainable Use License | Confirmed via Wikipedia and n8n site | OK |
| ToolJet license | AGPL-3.0 | Confirmed; "ToolJet © 2023, ToolJet Solutions Inc — Released under the GNU Affero General Public License v3.0" | OK |
| Activepieces | MIT + commercial `ee/` | Confirmed | OK |
| Auth.js (NextAuth) | ISC | Confirmed; "**Auth.js is now part of Better Auth**" — striking claim to verify | Re-verify |
| Better Auth | MIT | **Confirmed** — repo LICENSE is MIT | OK |
| Ory Hydra | Apache-2.0 | Confirmed | OK |
| Keycloak | Apache-2.0 | Confirmed | OK |
| Logto | MPL-2.0 | Confirmed; cloud dir is Elastic-2.0 | OK |
| SuperTokens | Apache-2.0 + commercial `ee/` | Confirmed | OK |
| Huginn | MIT | Not verifiable from this session's search | Mark "unverified" |
| Better Auth OAuth-provider plugin | MIT | Confirmed in better-auth monorepo | OK |

## Coverage gaps

Missing candidates the orchestrator should evaluate:

1. **Klavis AI** — OSS + MCP-native tool-auth. Per the validator's independent knowledge: github.com/Klavis-AI/klavis (verify). Could be a better primary than Nango for memroos because it solves the same problem AND is MCP-first.
2. **Scalekit** — purpose-built for agent-tool OAuth, recently launched.
3. **Stytch Connected Apps** — Stytch's connected apps product is exactly this space.
4. **Descope Outbound Apps** — Descope's outbound OAuth product.
5. **Composio's license history** — needs verification: was Composio always MIT? when did it introduce the managed cloud? was there a license shift? The contract explicitly asked.
6. **Pipedream Connect MCP server** — spike mentions it briefly; verify the claim that it exposes "10,000+ tools".

## Recommendation soundness

**The ELv2 / AGPL contradiction.** The spike reads:
- memroos is "local-first, single-tenant" → ELv2 not a problem
- memroos has "a hosted SaaS option" → AGPL not viable

These two cannot both be true. The right resolution is to **decide upfront**:
- If memroos ships a hosted SaaS option (which the spike implies at v8.22 FLEET-22 and the install profiles), ELv2's managed-service clause IS a live risk for any Nango feature that's externally-facing (the "Connect UI" if memroos surfaces it to its own end-users in the SaaS model). Self-host Nango side-steps this; hosted Nango + SaaS does not.
- If memroos is pure self-host (which the install profiles also support), then ELv2 is genuinely fine AND AGPL is much less scary (AGPL only triggers if memroos-the-installed-software exposes user-facing network access to AGPL-licensed code — for a self-hosted internal-only ToolJet, this might be acceptable).

**Action:** pick a lane. Either:
- "memroos is primarily self-hosted per-installation; SaaS is opt-in for enterprises who accept the ELv2 wrap" → Nango primary, ToolJet re-evaluates upward
- "memroos is a hosted SaaS" → Nango requires self-host OR the ELv2 wrap is a managed-service question that needs Nango's counsel

**The Nango self-host stack is heavy.** server + workers + Postgres + Redis. This is the heaviest entry in the survey and fights memroos's own FLEET-22 "single-binary/single-container" model. The spike should explicitly call out: "**Nango self-host adds 3-4 services to memroos's docker-compose** — this is a real cost." The alternative is hosted Nango (Luis set up an API key → likely hosted free tier), which moves token custody off-host.

**The MCP axis is wrong.** memroos is MCP-first. Nango is "adapter, not first-class MCP". The candidates that ARE MCP-first (Composio, Arcade, and the missed Klavis) get dismissed. Nango wins on catalog (900+), not on memroos's actual axis (MCP).

**Better Auth = MIT: confirmed.** The fallback path is sound.

## Roadmap block issues

1. **Criterion 1 hard-codes 10 providers** — over-scoped for one phase. Should be 3-5 providers + the catalog scaffolding for adding more.
2. **OAuth-only vs hybrid is silently pre-decided** — the contract lists this as an open question. The spike should either resolve it (with rationale) or defer it explicitly to a follow-on phase.
3. **`TOOLAUTH-01..06` are undefined** — the spike uses the IDs but doesn't define what each one covers. Define or drop the IDs.
4. **Phase block hard-codes the Nango/Better-Auth pick** — the spike's recommendation but the validator's REVISE means we shouldn't yet commit to one. Phase block should be tool-auth-plane agnostic about implementation; the spike's recommendation is input, not output.

## Verdict recap

**REVISE — additive fixes only.** The direction is right (memroos needs a tool-auth plane, the candidates are the right candidates); the reasoning has three real holes that need to close before the roadmap entry is committed:

1. Resolve the ELv2 / AGPL contradiction (decide memroos's SaaS posture).
2. Add the missing candidates (Klavis, Scalekit, Stytch, Descope).
3. Strip the implementation hard-codes from the Phase 179 block (let the spike's recommendation guide, not pre-commit).

After these fixes, the spike + roadmap entry are ready to commit.