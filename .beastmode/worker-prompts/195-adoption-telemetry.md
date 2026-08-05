# TASK: Phase 195 — Adoption Telemetry + GSD Gates (ADOPTTEL-01..05)

Read the full plan FIRST: .planning/phases/195-adoption-telemetry-gates/195-01-PLAN.md
and the roadmap section "Phase 195" in .planning/ROADMAP.md. Phases 191-194 are all merged
in this tree (prior-work probe, session hooks + self-capture, save-quality gate +
auto-promotion, habit layer) — their producers are what you are measuring.

HARD GATE from the roadmap sequencing note: step 1 is producer verification. For each metric
row you build, first verify the producer emits (retrieval_trace events from PRIORWORK-04,
capture events from SELFCAP-02, save-quality scores from SAVEQ-01, promotion receipts from
SAVEQ-04, rediscovery flags from EFFTEL/SAVEQ). Find each one's storage location by reading
the Phase 191/192/193 code (grep retrieval_trace, save_quality, promotion). Any metric whose
producer you cannot find or cannot see writing in tests must render as an explicit
known-unwired state (the NOCUX honest-states pattern from v8.18) — never a fabricated zero.

1. ADOPTTEL-01 — NOC Memory Adoption panel: per-agent/per-harness recall-before-work rate,
   capture-per-session rate, rediscovered-fact rate, save-quality distribution, silver→gold
   throughput. Backend: extend the existing NOC API route(s) (find the NOC data route under
   apps/memroos/src/app/api/noc or similar; follow Phase 173-174 patterns). Frontend: one
   new panel component following the existing NOC panel structure. Honest states everywhere.
2. ADOPTTEL-02 — generalize scripts around research-without-persist-detector (find it —
   grep the repo) across Wave-1 harness session roots (Claude Code ~/.claude/projects,
   Codex, Hermes, OpenClaw, Pi — the detector likely documents its roots); findings become
   NOC Attention items via the attention producer, not only cron logs.
3. ADOPTTEL-03 — GSD closeout gate: scripts/check-gsd-memory-receipts.mjs — a phase/goal
   closeout is non-compliant unless the goal record carries a prior-work probe receipt at
   start and a learnings/decisions write (or typed skip receipt) at close. Inspect how GSD
   goals/receipts are stored (grep goal probe / probe receipt from Phase 191/MEMHABIT-04
   work) and gate on that structure; wire `check:gsd-memory-receipts` into package.json and
   CI in the same pattern as check-roadmap-priority (find it in .github/workflows).
4. ADOPTTEL-04 — SLO definitions recorded: retrieval-before-work >=70% of working sessions;
   >=1 governed write or typed skip per working session; rediscovered-fact rate declining
   over 30d; silver→gold throughput >0 weekly. Implement as computed fields in the adoption
   API with SLO status (met/unmet/unknown-insufficient-data) — measured from live tables,
   never fixtures.
5. ADOPTTEL-05 — eval fixtures: the five scenarios named in the roadmap (fresh-employee/
   prior-work-exists, no-prior-work, junk save coach-back, duplicate save rediscovery,
   old-critical-beats-recent-noise) as vitest tests against the real modules (probe, save
   gate, ranking) with seeded fixture data — regression-guarding the Phase 118 ranking
   through the new seam.

Run full fast suite + typecheck at the end.
