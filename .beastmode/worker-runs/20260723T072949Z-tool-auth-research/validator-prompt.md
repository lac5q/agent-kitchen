You are the validator for a beastmode research run on the memroos project.

TASK: Read the research spike at /home/lac5q/github/memroos/.planning/spikes/2026-07-23-tool-auth-ux-research.md and the contract at /home/lac5q/github/memroos/.beastmode/GOAL_STATE.tool-auth-ux.md. Produce a validation report at /home/lac5q/github/memroos/.planning/spikes/2026-07-23-tool-auth-ux-validation.md.

The orchestrator has recommended **Nango (self-hosted or hosted)** as the primary path for memroos's third-party tool authentication UX, with Better Auth + custom registry as the OSS-purity fallback. The orchestrator is the same model as the worker (intentional — only the validator is independent). Your job is to be adversarial: find what the research got wrong or missed.

OUTPUT STRUCTURE (use exactly these sections):

## Verdict
PASS or REVISE or REJECT, with a one-line justification.

## Factual accuracy
For each factual claim in the survey table (license, stars, last activity, repo URL, supported API count), flag any wrong or unverifiable cell. The orchestrator used Exa MCP and Bing RSS in 2026-07-23 to fill these — your training cutoff may differ; if so, say so explicitly and trust the orchestrator's fresh data where it conflicts with your prior knowledge.

## Coverage gaps
What candidates are missing or under-weighted? Specifically consider:
- ToolJet has its own MCP server (tooljet-mcp) — did the orchestrator credit this?
- Apify, browser-use, smolagents, LangChain tool auth — relevant?
- Composio's recent license shift (was it always MIT? when did it ship new SDK?)
- Arcade's MCP story vs the orchestrator's claim that "managed auth runtime is closed-source Arcade Cloud"
- Pipedream Connect MCP server (mentioned briefly — accurate?)
- Stytch, Descope, Scalekit — new entrants worth considering?
- Any other OSS tool-auth candidate the orchestrator missed?

## Recommendation soundness
Is "Nango primary, Better Auth fallback" the right call for memroos given:
- memroos is local-first, single-tenant-per-install
- memroos already has HS256 JWT for user auth (not building that)
- memroos already has AES-256-GCM vault (FLEET-22)
- memroos's integration pattern is MCP tools (agents consume)
- Phase 176 (Linear/Circleback) and Phase 178 (Paperclip) are already hacking this
- Luis just set up a Nango API key (commitment signal)

Specifically challenge:
- Is the Elastic License v2 concern over-stated? Is the orchestrator's reading of the Nango license issue thread correct?
- Is Better Auth really MIT? Confirm.
- Is there a better primary candidate the orchestrator missed?
- Should the recommendation be ordered differently?

## Roadmap entry
Is the draft Phase 179 block (under "## Draft roadmap phase block") ready to paste into .planning/ROADMAP.md as-is, or does it need revision? Check:
- Format consistency with the existing v8.20/v8.22/v8.18 entries (Goal / Depends on / Requirements / Success criteria / Out of scope / Progress Table)
- Requirement IDs (TOOLAUTH-01..06) — sensible?
- Success criteria — actually verifiable?
- "Source opinion" pointer — both files cited?
- Out-of-scope section — anything that should be IN scope that isn't?

## Constraints
- Read-only inspection of the spike and the contract.
- Write only /home/lac5q/github/memroos/.planning/spikes/2026-07-23-tool-auth-ux-validation.md.
- Do not modify .planning/ROADMAP.md, .learnings/BEASTMODE.md, package.json, or anything else.
- Do not run package installs, network mutations, or destructive commands.
- Use your full context. You are Claude Opus 4.8 in a claude-pro lane — your model is independent of the orchestrator's MiniMax-M3.

Begin.