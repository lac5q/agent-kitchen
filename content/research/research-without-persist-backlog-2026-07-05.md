---
title: "Research-without-persist backlog — 2026-07-05 first sweep"
description: "Triaged list of 151 Hermes sessions flagged by the research-without-persist detector on its first --full run, including detector-bias analysis and recovery actions taken."
publishedAt: "2026-07-05"
tags: [memroos, persist-audit, backlog, detector-calibration, cron]
keywords: [research-without-persist, detector, cron, hermes, memroos, backlog]
author: "Alba [bot]"
source_session: "cron-job-research-without-persist-2026-07-05"
model: "minimax-m3"
sources:
  - "https://github.com/lac5q/memroos/blob/main/scripts/research-without-persist-detector.py"
  - "https://github.com/lac5q/memroos/blob/main/content/research/memroos-persist-failure-rca-2026-07-05.md"
  - "https://github.com/lac5q/memroos/blob/main/.agents/skills/memroos-save/SKILL.md"
  - "file:///Users/lcalderon/.hermes/cron/output/research-without-persist-2026-07-05.md"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
  - "content/research/memroos-hardening-july-2026.md"
regen_prompt: "Re-run python3 ~/.hermes/scripts/research-without-persist-detector.py --full, classify each session by tier, spot-check whether any direct-write fallback path was used (under ~/github/knowledge/ or ~/github/memroos/content/), and write a triage doc to memroos content/research/research-without-persist-backlog-YYYY-MM-DD.md."
---

# Research-without-persist backlog — first sweep (2026-07-05)

## Summary

The daily cron job `research-without-persist-detector` ran its first `--full` sweep on 2026-07-05 (UTC 21:35:52). It found **151 sessions** in `~/.hermes/sessions/` that produced research-style content without calling `mcp_memroos_knowledge_write`. **This number is misleadingly high** for two reasons described below.

## Why 151 is over-counted

The detector's heuristics (per `scripts/research-without-persist-detector.py` lines 73-86) flag a session if either:

1. The user said any of `save / document / archive / file / store / preserve / persist / write down / capture / note this` — matched as verbs in **any** context, including cron error messages, model-switch pings, and "save the jobs" fetch tasks.
2. The session cited any URL matching `https?://` followed by non-whitespace — including social-media posts, artyfacts URLs, and one-off links.

Spot-checks (15 sessions sampled) show this matches many false positives:

| Pattern | Example session | Why it's flagged but not a real miss |
|---|---|---|
| Cron-error message contains "save/document" verb | `20260512_211219_4f4055` | Cron response literally says "stop reminder Regular text-message response review" — not a save request |
| Single "save" verb in passing | `20260519_173730_5a6fb4` (overlap) | User asked "save" as a side instruction among a multi-part question |
| Model-switch system note | `20260507_184229_8e439ece` | System note flagged for artyfacts URL, not real research |
| Job-board / fetch | `20260505_023729_57a674`, `20260505_015218_d4b1c4` | "save the jobs" is a generic verb in a fetch task |

### Detector bias #1: it ignores the direct-write fallback path

Per `~/.hermes/AGENTS.md` and the `memroos-save` skill, when `mcp_memroos_knowledge_write` is unavailable agents may write directly to `~/github/knowledge/<path>.md` and `git commit`. The detector only checks for `mcp_memroos_knowledge_write` calls in the transcript, so it flags these sessions even though the research landed durably.

**Confirmed examples (research did persist, but via fallback):**

- `20260424_145419_6875c5` — Vendasta research → `~/github/knowledge/projects/agency/vendors/vendasta.md` (49 KB, 1025 lines). Verified by spot-check.
- `20260423_142632_6280ffbf` — applypilot pipeline → persisted to project notes under `~/github/knowledge/`.

### Detector bias #2: no ngram/header check on the actual deliverable

Even in sessions where the *user* said "save", the *assistant* may have generated only a clarifying question, a single-line acknowledgement, or a fetch-and-format task. The detector doesn't read enough of the assistant's output to confirm research-grade content was actually produced.

## Triage tiers

| Tier | Definition | Count | Recommended action |
|---|---|---|---|
| A | User said "save" AND ≥1 URL cited, OR ≥5 URLs cited alone | 50 | Spot-check 5-10 highest-signal. If real research, recover. |
| B | User said "save" alone, OR 1-4 URLs cited alone | 101 | Lower priority. Most are likely noise from the loose heuristics. |
| C | Neither trigger | 0 | n/a — the detector only flags A or B conditions. |

**Tier A and B session table (151 rows):**

| Session ID | Tier | save-trigger | URLs cited |
|---|---|---|---|
| `20260412_091508_2e1b0e4a` | B | YES | 0 |
| `20260412_093636_443c8ba6` | A | YES | 32 |
| `20260412_100003_7f9dc201` | B | YES | 0 |
| `20260412_224312_422fee90` | B | - | 1 |
| `20260413_082305_e23bc620` | A | YES | 51 |
| `20260413_085341_8a866cbd` | B | YES | 0 |
| `20260413_104226_b3b6cee6` | A | - | 5 |
| `20260413_131641_1ab1211f` | B | - | 1 |
| `20260413_134635_c84a2947` | A | YES | 3 |
| `20260414_053203_6ae6c5db` | A | YES | 8 |
| `20260414_210258_3bf226aa` | A | YES | 8 |
| `20260419_010237_52f4c1b2` | B | YES | 0 |
| `20260421_162024_d02bb22e` | B | - | 1 |
| `20260421_211058_3c4ad1ab` | B | YES | 0 |
| `20260422_100640_1def6430` | B | - | 1 |
| `20260422_161448_bbbe4e44` | A | YES | 10 |
| `20260423_013922_6d610b6b` | B | YES | 0 |
| `20260423_015518_86b215c5` | B | - | 1 |
| `20260423_105410_5cfc58` | A | - | 7 |
| `20260423_113730_efd6aa` | B | YES | 0 |
| `20260423_114308_9e515ec9` | A | YES | 2 |
| `20260423_123953_cd05ad` | A | YES | 2 |
| `20260423_133853_5385d3` | A | YES | 3 |
| `20260423_134426_7232fccb` | B | YES | 0 |
| `20260423_135351_a2484a` | A | YES | 2 |
| `20260423_135641_7eddde` | A | YES | 2 |
| `20260423_142632_6280ffbf` | A | YES | 16 |
| `20260424_032013_584ced` | A | - | 6 |
| `20260424_090750_6a1c6f3a` | A | YES | 6 |
| `20260424_132649_81c617a2` | B | - | 4 |
| `20260424_132935_df58bd32` | A | YES | 14 |
| `20260424_135926_a21889da` | A | YES | 2 |
| `20260424_145419_6875c5` | A | YES | 27 |
| `20260424_151947_6d28706e` | B | YES | 0 |
| `20260425_064341_c21e0297` | B | - | 3 |
| `20260426_111348_533e73d5` | B | YES | 0 |
| `20260427_090341_2e91a60f` | B | - | 2 |
| `20260427_122956_ee38b3be` | B | - | 1 |
| `20260427_131434_d272f71e` | B | - | 1 |
| `20260427_132552_fa92444b` | B | - | 2 |
| `20260428_002441_aef5683a` | B | - | 1 |
| `20260428_093010_5520ef` | B | - | 1 |
| `20260429_092340_16df113e` | B | - | 1 |
| `20260429_100744_fec69717` | B | - | 1 |
| `20260429_172650_3c5de6eb` | B | - | 1 |
| `20260430_084730_cf8f98` | B | YES | 0 |
| `20260430_104655_1df6744e` | B | YES | 0 |
| `20260430_220328_ef4cfd76` | B | - | 2 |
| `20260501_011208_22045ed0` | B | YES | 0 |
| `20260501_130708_62c8f9` | A | YES | 3 |
| `20260501_133222_cccb9a` | B | YES | 0 |
| `20260503_165948_6139bf1c` | B | YES | 0 |
| `20260503_182254_832751c6` | B | - | 2 |
| `20260503_202726_e70319d7` | B | - | 1 |
| `20260503_204156_2e24a6cc` | B | - | 2 |
| `20260504_115129_fdda060e` | A | - | 7 |
| `20260504_115149_c56f15a7` | A | - | 14 |
| `20260504_121021_274b6f8c` | B | - | 1 |
| `20260505_015218_d4b1c4` | A | YES | 4 |
| `20260505_021329_c824e8` | A | YES | 5 |
| `20260505_023729_57a674` | A | - | 29 |
| `20260505_024609_14428a` | B | YES | 0 |
| `20260505_024703_f263f4` | A | YES | 12 |
| `20260505_083724_bdc24a53` | B | - | 2 |
| `20260505_085542_2dae4998` | B | - | 1 |
| `20260505_092610_c644c9` | B | YES | 0 |
| `20260505_103024_afaddd81` | B | - | 2 |
| `20260505_105331_f3ee33` | B | YES | 0 |
| `20260505_114223_03b92d3a` | B | - | 1 |
| `20260505_114545_3bc02520` | A | - | 7 |
| `20260505_120154_bb3215` | B | - | 1 |
| `20260505_180651_bbea6d5a` | B | - | 2 |
| `20260505_233432_568997` | A | - | 9 |
| `20260506_004930_a93091` | A | - | 9 |
| `20260506_005533_12a94ba4` | B | - | 2 |
| `20260506_010550_f8402a55` | B | - | 3 |
| `20260506_011013_1a3a98` | A | - | 6 |
| `20260506_034010_3f6d05` | A | - | 6 |
| `20260506_161820_221a0545` | B | - | 2 |
| `20260506_180320_6277f6` | B | YES | 0 |
| `20260506_213258_8bb28317` | A | YES | 1 |
| `20260506_214548_d22ffb8c` | A | - | 6 |
| `20260506_220650_07141f` | B | YES | 0 |
| `20260506_220650_e9072d` | B | YES | 0 |
| `20260506_221224_441fa3` | B | YES | 0 |
| `20260506_223235_5bcc86a5` | B | - | 1 |
| `20260507_000715_a77021` | B | YES | 0 |
| `20260507_001916_486c94` | B | YES | 0 |
| `20260507_002811_956af7` | B | YES | 0 |
| `20260507_003410_5561dd` | B | YES | 0 |
| `20260507_003846_65a840` | B | YES | 0 |
| `20260507_003904_bd160c` | A | YES | 11 |
| `20260507_011506_e822a8` | B | YES | 0 |
| `20260507_015737_9320e0` | B | YES | 0 |
| `20260507_015810_82b410` | A | - | 8 |
| `20260507_020530_3e976d` | A | YES | 5 |
| `20260507_022312_51a1d4` | B | YES | 0 |
| `20260507_024603_3b5040` | A | YES | 3 |
| `20260507_030928_0ca96d` | A | YES | 4 |
| `20260507_092519_6ae438dd` | B | - | 1 |
| `20260507_095613_00a76f0b` | B | - | 1 |
| `20260507_111744_44331f` | A | YES | 9 |
| `20260507_112054_659e88` | A | YES | 2 |
| `20260507_115920_49c47716` | B | - | 4 |
| `20260507_184229_8e439ece` | A | YES | 1 |
| `20260507_210811_aeae3c51` | B | - | 1 |
| `20260509_074901_4e28dd12` | B | - | 4 |
| `20260509_214955_ded7d172` | B | - | 3 |
| `20260510_211932_7672cd52` | A | YES | 3 |
| `20260511_035115_eaedef43` | B | YES | 0 |
| `20260511_041423_be2226e2` | B | - | 1 |
| `20260511_043253_7f86ec91` | B | - | 1 |
| `20260511_050456_45c98545` | B | - | 3 |
| `20260511_131652_9862b9` | B | YES | 0 |
| `20260511_132746_af7019` | B | YES | 0 |
| `20260511_134857_ebd574` | B | YES | 0 |
| `20260512_090704_93ddc0` | A | YES | 4 |
| `20260512_111144_e0f28750` | B | - | 4 |
| `20260512_123144_bbe78a` | B | YES | 0 |
| `20260512_211219_4f4055` | B | YES | 0 |
| `20260513_101609_1fd48387` | A | YES | 2 |
| `20260513_101835_d316f69c` | A | YES | 2 |
| `20260513_102800_a23af911` | B | - | 4 |
| `20260513_102927_fb387be3` | B | - | 1 |
| `20260513_102952_18c819dc` | B | - | 2 |
| `20260513_103005_e376699e` | B | - | 1 |
| `20260513_112330_379e35d2` | B | YES | 0 |
| `20260513_131120_20ecab1b` | B | - | 2 |
| `20260514_100706_bc0d01ab` | B | YES | 0 |
| `20260514_105440_b87adb62` | B | - | 1 |
| `20260514_130949_899397` | A | YES | 13 |
| `20260514_131140_13596a` | B | YES | 0 |
| `20260514_132346_40cc3d5d` | B | YES | 0 |
| `20260515_080913_044d3842` | B | YES | 0 |
| `20260515_104527_c0b713b6` | A | YES | 5 |
| `20260515_113451_b6fa59cb` | B | YES | 0 |
| `20260516_052600_fee927ed` | A | - | 5 |
| `20260516_203628_58ddc251` | B | - | 1 |
| `20260517_182832_309a062a` | B | YES | 0 |
| `20260518_063527_93dcdbbd` | B | - | 1 |
| `20260518_121632_2ef3ea` | B | YES | 0 |
| `20260518_134125_9c15648f` | A | YES | 10 |
| `20260519_101035_70554aac` | B | - | 2 |
| `20260519_101303_6c88b1` | B | YES | 0 |
| `20260519_115613_8e7f3165` | B | YES | 0 |
| `20260519_173730_5a6fb4` | A | YES | 1 |
| `20260519_222104_fd39fe` | B | - | 1 |
| `20260520_081649_76716395` | B | - | 1 |
| `20260520_083018_522e10` | B | YES | 0 |
| `20260520_120912_ae88c3d8` | B | - | 2 |
| `20260520_125639_aa8634` | B | - | 2 |

## Real misses recovered this run

After spot-checking 15 Tier A sessions against `~/github/knowledge/` and `~/github/memroos/content/`, the following two sessions were confirmed to have produced research-grade content that did **not** land durably anywhere:

| Session ID | Title | Recovered path |
|---|---|---|
| `20260414_053203_6ae6c5db` | Context-rot LinkedIn/X post research | `content/research/recovered-context-rot-posts-2026-07-05.md` |
| `20260519_173730_5a6fb4` | Creator outreach offer + Collabstr vetting | `content/research/recovered-creator-outreach-offer-2026-07-05.md` |

The Vendasta research (`20260424_145419_6875c5`) was *not* re-recovered because the durable copy already exists at `~/github/knowledge/projects/agency/vendors/vendasta.md`. A link-only pointer to that existing doc would be a useful follow-up but is out of scope for this single cron tick.

## Recommended next steps (not done in this run)

1. **Tighten the detector heuristics.** Recommended patch to `scripts/research-without-persist-detector.py`:
   - Add a positive signal: "did this session's transcript include any `write_file` or shell `cat >` tool call writing under `~/github/knowledge/` or `~/github/memroos/`?" If yes, mark `has_write = True`.
   - Add a quality filter: only flag if the assistant produced ≥500 chars of structured text (headers, lists, or comparison tables).
   - Cross-reference each session's git history: `git -C ~/github/knowledge log --since=<session_epoch-1h> --until=<session_epoch+24h>` to see if any commit landed in the relevant window.

2. **Bulk-classify the remaining 149 sessions.** A short follow-up cron (or human review pass) can sweep Tier B and Tier A-remaining to identify any other real misses. Most are expected to be false positives or fallback-path persists.

3. **Fix the ratchet.** Once the detector is tightened, the daily cron should produce ~0-5 findings per day instead of backlog-style dumps like today's 151.

## Audit trail

- Detector script: `~/.hermes/scripts/research-without-persist-detector.py` (run 2026-07-05T21:35:52Z)
- Source report: `~/.hermes/cron/output/research-without-persist-2026-07-05.md`
- Last-run marker set: `~/.hermes/cron/output/.research-without-persist.last-run` (epoch 1783287391) — subsequent cron runs will be incremental
- Cron schedule: daily 09:00 PT (per MemroOS self-healing stack table in `memroos-operations` skill)
- Bot author for fallback writes: `Alba [bot] <alba@memroos.dev>` (per `memroos-save` skill fallback flow)
