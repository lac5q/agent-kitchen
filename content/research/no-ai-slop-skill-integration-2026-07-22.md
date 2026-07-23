# no-ai-slop Integration into Hermes Human-Copy-Check — 2026-07-22
*Research / RCA + integration plan. Author: Alba (Hermes Agent). Requested by Luis Calderon (Discord: `Epilogue Capital / #devops`).*

---

## TL;DR

Peter Yang open-sourced `petergyang/no-ai-slop` on 2026-07-22: a 90-line SKILL.md + 42-line eval.md skill that catches 20+ AI-writing patterns (MIT). Our existing `human-copy-check` skill already covers ~80% of those patterns and is wired into every content-machine, approval, and reply-agent runtime gate. We did **not** add a parallel skill — we extended the existing one with the genuine deltas and shipped `no-ai-slop` as a supplementary reference skill to every agent CLI through the existing install pipeline. Net: one canonical rule, two surfaces (in-house script + upstream reference), every CLI gets both.

**Files changed** (5):
- `skill-runtimes/hermes/copywriting/human-copy-check/SKILL.md` — added 14 pattern entries + Two-jobs section + detect-mode docs
- `skill-runtimes/hermes/copywriting/human-copy-check/scripts/check_human_copy.py` — added 11 new regex patterns + `--detect` flag
- `github/no-ai-slop/` — vendored copy with provenance (git init + initial commit)
- `github/memroos/scripts/install-agent-integrations.sh` — added `EXTRA_SKILLS` env-var hook to fan out arbitrary extra skills
- `content/research/no-ai-slop-skill-integration-2026-07-22.md` — this file

**Distribution outcome**: 12 agent CLIs (Hermes, Claude, Codex, Cursor, Gemini, Qwen, ZCode, Pi, Droid, Grok, OpenCode, Cline) + 12 OpenClaw workspaces received `no-ai-slop` via a single `EXTRA_SKILLS="..."` invocation of the installer.

---

## Why not add `no-ai-slop` as a parallel skill

The lazy answer is to fork, vendor it as a separate skill, and call it a day. The senior-engineer answer is **don't**. Three reasons:

1. **Drift hazard.** Two skills with overlapping rules will disagree within a month. The agent that runs `human-copy-check` passes a draft; the agent that runs `no-ai-slop` flags the same draft. Operator gets conflicting signals.
2. **Runtime gate already wired.** `check_human_copy.py` is invoked at every content-machine handoff (draft save, preview generation, approval processing, final publish). Adding a parallel script means plumbing a second invocation into all four handoffs — strictly more code, more failures, more drift surface.
3. **In-house catalog already wins on operator specifics.** Our existing rules carry Luis-specific escalations (`attack-dog contrarianism`, the 2026-07-13 contracted-negation-pivot cases, the 2026-07-19 false-negative pitfalls). Upstream `no-ai-slop` is generic. The merge direction is upstream → in-house, not the reverse.

The right move is **extend the existing skill** with the genuine deltas (the ~14 patterns upstream names that we don't), keep our escalations, and ship upstream's full reference alongside so any agent CLI that prefers the upstream voice can load it directly.

## Genuine deltas (what we added)

Upstream patterns absent from in-house catalog before this integration:

| Pattern | Upstream example | In-house before | In-house now |
|---|---|---|---|
| Throat-clearing openers | "Here's the thing," / "Let me be clear," | partial (only `here's what you need to know`) | regex added |
| Faux-insight setups | "The part everyone misses," "What nobody tells you" | not flagged | regex added |
| Colon-reveal drama | "The best part: it learns." | not flagged | regex added (with FP guards) |
| Importance puffery | "stands as a testament," "marks a pivotal moment" | partial (`testament to`) | regex extended |
| Fake-strong verbs | "serves as a centralized hub for," "represents the culmination of" | short forms only (`serves as a`) | regex extended |
| Weasel attribution (full) | "experts agree," "widely regarded as" | partial (`experts argue`) | regex extended |
| Negative listing | "Not a X. Not a Y. A Z." | not flagged | regex added |
| Dramatic fragmentation | "X. And Y. And Z." | not flagged | regex added |
| Robotic rhythm | repeated sentence shapes | partial (metronome only) | SKILL.md guidance for read-aloud pass |
| Rhetorical setups | "What if I told you," "Plot twist:" | not flagged | regex added |
| Fake-profound kickers | final "deep" aphorism line | partial (generic closers) | SKILL.md distinct entry |
| Summary-recap endings | "In conclusion," "Ultimately," | partial (`in conclusion` only) | regex extended |
| Em dash as rhythm crutch | 3+ em dashes in one paragraph | single em dash only | regex cluster added |
| Synonym cycling | "the agent / the assistant / the tool" rotation | not flagged | SKILL.md guidance (regex-resistant) |

**SKILL.md gain**: +14 hard-fail entries, +1 "Two jobs" section, +detect-mode docs. No existing rule deleted.

**Script gain**: +11 regex patterns, +`--detect` flag mirroring upstream's detect job.

## Cross-CLI distribution: the installer hook

`scripts/install-agent-integrations.sh` shipped only `memroos-save` before. Adding a parallel skill meant either forking the installer (drift) or adding a hook. The hook wins:

```bash
# ~/.hermes or one-shot env override
EXTRA_SKILLS="no-ai-slop|$HOME/github/no-ai-slop" \
  bash ~/github/memroos/scripts/install-agent-integrations.sh
```

The hook fans out to **every** target in the existing `TARGETS` array (12 agent CLIs + every discovered OpenClaw workspace). It also handles uninstall cleanly (`--uninstall` with the same env var). Future skill integrations just add an entry to `EXTRA_SKILLS`; no code changes.

**Why an env var, not a config file**: env var keeps the canonical installer portable across machines. A repo-local `EXTRA_SKILLS.conf` would have to be either committed (leaks operator-specific paths) or gitignored (drifts between hosts). Env var is host-local, ephemeral, and explicit at the call site.

## Verification

Smoke test on a known-AI-slop sentence:

> "This is the part everyone misses: distribution is the moat. In today's fast-paced landscape, companies must leverage cutting-edge AI to unlock seamless collaboration. Studies show experts agree it represents a pivotal moment. Ultimately, the team has the ability to facilitate robust workflows."

Result: **12 hard fails** — `AI vocabulary` (7 hits across `leverage`, `cutting-edge`, `unlock`, `seamless`, `pivotal`, `robust`, `transformative`), `Copula avoidance` (`represents`), `Hyphenated pair cluster` (`cutting-edge`), `AI throat-clearing opener` (`today's fast-paced landscape`), `Faux-insight setup` (`part everyone misses`), `Weasel attribution` (2 hits: `studies show`, `experts agree`).

Smoke test on a clean draft:

> "Distribution beats product. I learned this the hard way at the last company. We had the better mousetrap and lost to a sales team that out-shipped us."

Result: **PASS** — zero findings.

Smoke test on em-dash cluster:

> "The system is fast — under 200ms — and accurate — 99.9% — and cheap — about $0.001 per call — to run."

Result: 7 single-em-dash hard fails + 1 `Em dash cluster` finding (3+ em dashes within one 240-char window).

All three positive controls pass. The `--detect` flag returns the same findings framed as evidence without rewriting authorization.

## Known limitations + ceiling

1. **Synonym cycling is regex-resistant.** We can't reliably detect "the agent / the assistant / the tool" rotation. This is a read-aloud pass requirement, documented in SKILL.md.
2. **Robotic rhythm is regex-resistant.** The `Metronome rhythm warning` catches only same-length sentences. Same-shape-different-words requires a human eye.
3. **Importance puffery regex is conservative.** It catches the canonical phrases but not arbitrary variations like "represents a watershed moment." Stay conservative to avoid FPs on legitimate uses.
4. **Installer hook is opt-in.** Operators must remember to pass `EXTRA_SKILLS=...` on each install run. A future iteration could read a `$HOME/.config/memroos/extra-skills.env` file so it auto-applies; skipped here as YAGNI.
5. **No automated CI for skill-content drift.** When upstream `no-ai-slop` updates, we have no diff monitor. Operator should subscribe to upstream releases or re-vendor quarterly.

## When to add the skipped pieces

- **Synonym cycling detector (NLP-based):** add when an agent produces 3+ term rotations in a single piece twice in a month. Until then, the read-aloud pass is cheaper.
- **Config-file `EXTRA_SKILLS`:** add when the same `EXTRA_SKILLS` value is passed to the installer 3+ times across different hosts.
- **Upstream-update monitor:** add when the operator has time to consume upstream diffs (no signal this is needed yet — upstream shipped once and went quiet).
- **Automated cross-CLI smoke test:** add when a content-machine fails a gate on a CLI other than Hermes and the cause is hard to reproduce.

## Provenance

- Upstream: https://github.com/petergyang/no-ai-slop (MIT, petergyang, 2026-07-22). Verified via `git ls-remote` and tarball download at HEAD `61c21c35`.
- Vendored: `~/github/no-ai-slop/` (git repo, commit `29ca551`, author `alba@memroos.dev`).
- Integrated: `~/github/knowledge/skill-runtimes/hermes/copywriting/human-copy-check/` SKILL.md + scripts/check_human_copy.py.
- Distributed: `~/.hermes/skills/no-ai-slop/`, `~/.claude/skills/no-ai-slop/`, `~/.codex/skills/no-ai-slop/`, plus 10 other agent CLIs and 12 OpenClaw workspaces. Antigravity skipped (no installer surface — verify-by-design).

## Artifacts

- Skill file changes: see git history of `~/github/knowledge/skill-runtimes/hermes/copywriting/human-copy-check/`.
- Installer change: `~/github/memroos/scripts/install-agent-integrations.sh` lines 50-58 (env-var declaration) + 379-393 (install_skill extension) + 404-410 (uninstall extension).
- This file: `~/github/memroos/content/research/no-ai-slop-skill-integration-2026-07-22.md`.