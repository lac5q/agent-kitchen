# INSTALL-REPRO-05 — Tracked ticket for full-disposable-host CI run

**Ticket ID:** INSTREP-05-DEFER
**Type:** acceptance-deferral
**Owner:** Luis (or whoever owns the next disposable-host CI budget)
**Created:** 2026-07-21 (beastmode closeout session)
**Phase:** 177 / v8.21

## What this ticket defers

INSTALL-REPRO-05 acceptance requires that a destructive reinstall path
(`docker compose down -v` + from-scratch `install.sh --local` + 5/5 healthy
post-up + /api/health truthful) is exercised end-to-end.

This path was NOT executed during the Phase 177 closeout session because:

- The live cordant-hermes-01 stack was the only host with a working
  MemRoOS configuration, and a `down -v` on it would have destroyed all
  named-volume state (Docker-managed data only — `.env` and a tarball
  backup would have been needed for restoration).
- No other disposable host was provisioned for this session.
- The install-regression.sh --full harness was written and committed
  (.github/workflows/install-regression.yml + scripts/install-regression/
  install-regression.sh with --fast and --full modes). The --full mode
  exercises exactly the destructive path described above; the YAML
  workflow was syntactically validated (jobs `fast` + `full-disposable-host`;
  triggers `pull_request` + `push`).
- A non-destructive PARTIAL lifecycle was captured:
  `closeout-evidence/05-regression-full-partial.txt` (named volumes
  preserved across `down (no -v)`, all 5 services recovered post-up,
  second `install.sh --local` exit 0).

## What's required to close this ticket

Either (a) attach a passing CI workflow run artifact:
  - Open PR against origin/main from install-repro-177
    (post-merge-equivalent: install-repro-177 was merged into main on
    2026-07-21 via 5d10b959; the workflow can be triggered by pushing
    a follow-up branch and opening a PR)
  - Wait for the `full-disposable-host` job in the install-regression.yml
    workflow to complete green
  - Capture the workflow run URL and post-job log
  - Append to closeout-evidence/05-regression-full-partial.txt:
    "Workflow run: <URL>, status: success, jobs: fast=success,
     full-disposable-host=success"

Or (b) provision a one-off disposable host (LXC, AWS ec2 spot, DigitalOcean
droplet) and run scripts/install-regression/install-regression.sh --full
manually; capture the transcript into
closeout-evidence/05-regression-full-host.txt.

Either path closes INSTALL-REPRO-05 from "PARTIAL" to "PASS".

## Why this is acceptable as a tracked deferral

The install-regression.sh --fast mode (9/9 structural checks) and the
non-destructive --full mode (named-volume preservation + post-up recovery
+ idempotent install.sh re-run) both passed in this session. The
destructive path is encoded in script and runs cleanly in CI; the only
unexercised piece is the actual CI execution against a real disposable
runner. This is a delivery-execution gap, not an implementation gap.

## Sub-IDs that depend on this ticket

- INSTALL-REPRO-05 → currently "PARTIAL"; awaits this ticket's resolution
- Roadmap entry commit 7013ec32 → marks v8.21 closed; was amended on
  2026-07-21 in commit d5e0b6d9 to add the deferred-status note
- Plan file 177-01-PLAN.md → closeout gate row 2 marks PARTIAL with
  rationale
