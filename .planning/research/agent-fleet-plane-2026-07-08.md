# Research Index — Agent Fleet Plane (2026-07-08)

Canonical durable artifacts (MemroOS content tree):

| Artifact | Path |
|----------|------|
| Architecture decision | `content/architecture/memroos-as-agent-fleet-plane-2026-07-08.md` |
| OSS control-plane survey | `content/research/agent-control-planes-2026.md` |
| Paperclip deep-dive audit | `content/audits/paperclip-control-plane-audit-2026-07-08.md` |
| Milestone kickoff | `.planning/milestones/v8.5-agent-fleet-plane-KICKOFF.md` |

## Verdict summary

- **MemroOS** = top fleet plane (registry, memory, governance, A2A, NOC)
- **LangGraph** = peer orchestration runtime (already wired under Orchestration Proxy)
- **Paperclip** = parallel tenant (companies, budgets, board); not top layer
- **Gardner** = no OSS match
- **Archestra** = closest governance cousin but AGPL + Enterprise dual license — not default
- **CrewAI ACP** = cloud-only control plane feature
- Cloud AgentCore / Foundry / Vertex = reference only, not self-host substitutes

## Independent validation

- **Achieved 2026-07-09** via beastmode-validator (GLM-5.2 BYOK). Verdict: **PASS**.
- Artifact: `content/architecture/memroos-fleet-plane-validation-glm52-2026-07-09.md`.
- Phase 142 validation gate is closed; architecture decision is locked.
