# MemroOS official-approved agent skills

Operator-approved skills that ship with every MemroOS agent-integration install.
Source of truth: this file + the skill directories under `.agents/skills/`.
Fan-out: `scripts/install-agent-integrations.sh`.

| Skill | Role | auto_load | Notes |
|-------|------|-----------|-------|
| `memroos-save` | Persist durable work to MemroOS | true | Core |
| `memroos-recall` | Check prior work before starting | true | Core |
| `ponytail` | Lazy-senior / YAGNI build ladder | false | Coding. Default **full**; Claude/Opus never default **ultra** |
| `no-ai-slop` | Anti-slop edit / detect | false | Writing polish |

## Companion directives (not skills)

| Artifact | Role |
|----------|------|
| `agents/AGENTS_TEMPLATE.md` | Canonical AGENTS/CLAUDE directive for every CLI |
| `agents/FORBIDDEN.md` | Banned prose patterns (staccato pairs, antithesis, isocolon pairs, backward-refs) |

Writing defaults in the template: ASD-STE100 Simplified Technical English, Zinsser's four principles, FORBIDDEN scan, writer context under 50%.

## Approval log

| Date | Skill / artifact | Decision |
|------|------------------|----------|
| 2026-08-12 | `ponytail`, `no-ai-slop`, `FORBIDDEN.md`, STE/Zinsser template sections | Official-approved by Luis. Keep Ponytail; propagate fleet-wide. Opus default full/lite, ultra only on explicit ask. |

## Install

```bash
bash "$HOME/github/memroos/scripts/install-agent-integrations.sh" --local
```

Official skills install without `EXTRA_SKILLS`. Optional host-local extras still work via `EXTRA_SKILLS="name|/path"`.

## Hosts to converge

- main-mac (this machine)
- maeve-u1
- cordant-hermes-01
- oracle-1 (when memroos checkout present)
