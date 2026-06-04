# Open Research Questions

## v2.5 — Eval Engine + Self-Improvement Platform (added 2026-05-14)

Surfaced during `/gsd-explore` session on memory evals + eval framework + autogen learnings. See `notes/eval-engine-3-layer-composite.md` for context.

1. **Golden-set curation strategy per business role.** Who authors the 50-example default golden sets for sales / support / finance / ops? Internal MemroOS team for v1? Source from publicly available benchmarks (TauBench, AgentBench, τ-bench)? Human-validated for 75–90% inter-annotator agreement before shipping? What's the minimum size for a meaningful drift-guard signal — is 50 examples actually enough or do we need 200?

2. **Business-system adapters for L3 outcome layer — which first?** Shortlist for v1 of phase 61: Salesforce, HubSpot, Zendesk, Intercom, QuickBooks, NetSuite, Jira, Linear, Slack. Which 3 cover ~70% of mid-market business ops? What auth surface (OAuth2 per vendor vs unified Nango/Pizzly)?

3. **Judge model selection + rotation policy.** Default cross-family pinned judge: Claude Haiku 4.5? Gemini Flash? GPT-mini? When the pinned model deprecates, what's the re-baseline procedure — rerun the entire golden set under both old and new judge, compute agreement, gate rotation behind ≥90% agreement? Who approves the rotation (operator only, or auto with audit)?

4. **Opt-in vs opt-out for user agent traces flowing into the eval engine.** If a customer's MemroOS deployment is running their own agents through the public eval API (phase 62), does MemroOS retain those traces for golden-set enrichment / cross-customer learning? PII implications? Default should almost certainly be opt-out, but the upside of pooled golden sets is the moat — how do we square that?

5. **Scalar W weighting for different industries / agent roles.** Defaults are `{l1: 0.2, l2: 0.5, l3: 0.3}`. Is that right for support agents (where outcome matters most) vs research agents (where quality matters most) vs compliance agents (where capability/policy matters most)? Should we ship 3–4 named preset profiles ("outcome-weighted", "quality-weighted", "compliance-weighted") rather than asking users to dial weights manually?

6. **Drift-guard floor (0.85 golden agreement).** Where does that number come from for real — is it defensible across roles and judge models, or does it need to be empirically calibrated per (judge_model × golden_set) pair? What happens if a customer's custom golden set produces lower agreement on the standard judge — do we raise the floor, lower the floor, or surface a "your golden set is ambiguous" warning?

7. **SEAL proposal types — closed list or extensible?** Memory has 6 proposal types in old phase 57 plan. Agents add `agent_instruction_patch`, `skill_addition`, `tool_routing_update`. Should the proposal type registry be a closed enum (safer, auditable) or pluggable (companies can define their own mutation surfaces — riskier, more flexible)?

8. **Provider-backed reflection vs local-only.** Old phase 57 had "the loop works when vector/Gemini quota is exhausted; provider-backed reflection is optional." Does that constraint hold for agent-level reflection too, or do agent-instruction edits require a smart enough model that local-only is impractical?

## v6.5 — Delegated User Access for Agent-Mediated Data (added 2026-06-04)

9. **OAuth delegation pushed down to data-element authorization.** What is the canonical representation for user access following an agent: encrypted OAuth token handle, provider credential reference, normalized claim set, or a combination? The requirement is that every agent-mediated retrieval, context pack, handoff, and memory save carries responsible user identity plus OAuth subject/scope/consent into deterministic policy checks, while raw bearer tokens never land in memory rows, audit rows, prompts, derived indexes, or agent-visible payloads. What minimum fields and regression fixtures prove the data element is controlled by user-plus-agent authorization rather than agent identity alone?
