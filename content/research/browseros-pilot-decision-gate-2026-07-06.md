---
title: BrowserOS Pilot — Decision Gate Hardened, Verdict Logic Verified
date: 2026-07-06
sources:
  - file://~/github/browseros-pilot/
  - commit: 9b8aa27
  - commit: b4bafc2
status: phase-1.2-verified-phase-1.3-blocked-on-luis
---

# BrowserOS Pilot — Decision Gate Hardened

## TL;DR

Caught a real bug in my own pilot design via fixture-based testing: the
original "BrowserOS wins ≥3 of 4 metrics" gate let a faster-failing run
masquerade as a winner. Replaced with a stricter 5-condition gate that
treats success rate as a prerequisite, not a metric. Verified via 4
synthesized scenarios, all match expected verdicts.

## What changed since last update

| Before | After |
|---|---|
| `awk`-based JSON extractor in `ingest-results.sh` (broken on single-line JSON) | `scripts/extract-last-json.py` — brace-depth-aware, returns last valid pilot-schema JSON |
| `≥3 of 4 wins` decision rule | 5-condition gate: success ≥ control, errors < control, recaptcha ≤ control, duration within 10% OR with backup, collisions=0 |
| Verdict logic untested | `.test-fixtures/ingest-tests/` with 4 scenarios, all match expected verdicts |
| Phantom dashboard JSON in repo | `.gitignore` covers `metrics-latest.json` (regenerated) |

## The decision gate (final)

For Phase 2 → Phase 3 to advance, **all 5 conditions** must hold:

1. Both browsers reported at least one run.
2. BrowserOS `success_rate >= Chrome DevTools success_rate`.
3. BrowserOS `avg_duration <= 1.10 × Chrome DevTools` OR (BrowserOS `errors < Chrome DevTools` OR `recaptcha_hits < Chrome DevTools`).
4. BrowserOS `errors < Chrome DevTools errors` (strict).
5. BrowserOS `recaptcha_hits <= Chrome DevTools recaptcha_hits` (ties OK).
6. BrowserOS `session_collisions == 0` (any non-zero = `REGRESSION_STOP` immediately).

Plain language: **BrowserOS must at minimum not regress on success AND win at least one of {duration, errors, recaptcha} decisively AND have zero session collisions.**

## Test results (4 scenarios, all verdicts match expected)

```
1. pass  → PASS
2. fail-recaptcha  → FAIL-recaptcha-not-lower
3. fail-duration-no-backup → FAIL-duration-no-backup (1.73x)
4. regression-stop  → REGRESSION_STOP
```

Test fixture transcripts live at `~/github/browseros-pilot/.test-fixtures/ingest-tests/transcripts/`. Driver at `.test-fixtures/ingest-tests/run-ingest-tests.sh`. Real `metrics/` never touched.

## Why I caught the bug

Writing 4 hypothetical scenarios — including "BrowserOS fails faster than Chrome DevTools succeeds" — exposed the original rule's flaw immediately. The faster-failing run had `WIN_1_OF_4` (won only duration), which would have *qualified* for Phase 3 under the old gate. Under the new gate it's a decisive FAIL because success_rate < control. That's the right answer.

## Persistent state

- Pilot repo: `~/github/browseros-pilot/`, commits `9b8aa27`, `b4bafc2`, `ceae38b`
- BrowserOS running on 9239 with isolated profile (empty cookies, awaiting Luis's sign-in)
- Chrome DevTools MCP not yet running (Luis triggers when ready)
- Pilot metrics dir empty
- Production untouched

## Block acknowledged

Phase 1.3 (live run) cannot proceed without Luis's 3-step setup. Decision
gate is now mathematically correct and verified. When Luis signs in,
the pipeline (run → ingest → dashboard → verdict) is a single command.

## What Luis needs to do to advance

| Step | Time | Required? |
|---|---|---|
| Sign into Gmail in the BrowserOS window | 30s | Yes |
| Sign into Linear in same window | 30s | Yes |
| Sign into Slack in same window | 30s | Yes |
| Tag ≥5 Gmail messages `Needs triage` | 1m | Yes |
| Start Chrome DevTools MCP (`chrome-automation-start 9222`) | 5s | Yes |
| Say "go" | triggers Phase 1.3 |

OR: Luis says "abort" → I tear down. Pilot repo + decision gate + eval evidence are durable regardless.
