# oracle-1 deploy: BLOCKED

**Date:** 2026-07-21 (post Phase 177 + Phase 176 first-session push to main)
**Status:** SSH auth available, no memroos repo yet
**Owner:** Luis

## Findings (2026-07-21 probe)

- SSH to `opc@oracle-1`: works (Linux oracle-1 aarch64)
- SSH to `ubuntu@oracle-1`: rejected (tailscale can't lookup `ubuntu`)
- SSH to `root@oracle-1`: works
- `~/memroos` on oracle-1: does not exist (no checkout, no install)

## What's needed to close

1. Luis installs the Cursor Cloud SSH pubkey on `opc@oracle-1` (per
   STATE.md note "Luis installs Cursor Cloud SSH pubkey on opc@oracle-1")
2. Once `opc@oracle-1` SSH works, mirror the same `install.sh --local`
   + `.env` rotation + `MEMROOS_BIND` work from cordant-hermes-01
3. Confirm `/api/health` truthful on oracle-1

## Architecture difference

cordant-hermes-01 is x86_64; oracle-1 is aarch64. The compose + install
flow should be identical, but the local image-build step (Dockerfile.memroos)
needs to support multi-arch — currently it builds for x86_64 only. Will
likely need `--platform=linux/arm64` flags for the build on oracle-1.

## Tracking

- This is a known pre-Phase-177 item; v8.15 on-host re-smoke was
  pending Luis's pubkey install before today.
- Phase 177 closeout did NOT include oracle-1 (no SSH pubkey available).
- The next session that needs oracle-1 E2E should pick this up.
