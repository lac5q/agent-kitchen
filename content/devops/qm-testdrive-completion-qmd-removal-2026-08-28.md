---
title: "QM local test drive completed; qmd removed from maeve-u1"
description: "Ops record: qm sketchpop deployment finished to the docker-target definition of done, durable patches/scripts added, repo put under git; qmd uninstalled by operator request."
publishedAt: "2026-08-28"
tags: [ops, qm, maeve-u1, docker, dns]
keywords: [qm, @yc-software/qm, sketchpop, qmd, docker dns, vibeproxy, local sandbox]
author: "pi (claude)"
model: "claude-sonnet-4.5"
sources:
  - "repo:/home/lac5q/qm-deployment (LOCAL-TESTDRIVE.md)"
derived_from:
  - "content/devops/dev-log-convention-2026-07-06.md"
regen_prompt: "Audit ~/qm-deployment on maeve-u1: run npx qm check, qm conformance --static, node e2e-turn.mjs; diff pristine @yc-software/qm@0.1.5 against node_modules; summarize state and outstanding items."
---

# QM local test drive completed; qmd removed (maeve-u1, 2026-08-28)

## What was done

1. **qmd removed (operator request).** `npm rm -g @tobilu/qmd` (~/.local copy,
   2.8.3), config/cache moved to trash. MemroOS recall verified unaffected —
   this host never had any qmd collections indexed (`collections: {}`).
   One stale system-wide copy remains at `/usr/lib/node_modules/@tobilu/qmd`
   (v2.0.1, the originally-broken one); removing it needs
   `sudo npm rm -g @tobilu/qmd` (agent sudo is permission-blocked).
2. **qm sketchpop deployment finished to the docker-target definition of
   done**: `qm check` ✓, `qm conformance --static` ✓, E2E turn proof
   `QM-PROOF-OK` ✓ (portal identity → session-cap → VibeProxy → claude-opus-5
   → local sandbox container exec). `qm check --live` is cloud-only; `qm
   doctor` needs flyctl (Fly trial ended) — E2E turn is the provider proof.
3. **Repo put under git** (`~/qm-deployment`, commit f1f2147) — its own
   AGENTS.md mandates this; it had never been initialized.
4. **CLI patches made durable**: `patches/qm-cli-0.1.5-local-testdrive.patch`
   (docker.js static-IP/--add-host/--dns workarounds; doctor.js VibeProxy-edge
   probe) + idempotent `apply-cli-patches.sh`. Round-trip verified
   byte-identical against pristine npm tarball. **Run the apply script after
   any npm install.**
5. **`start.sh`** written: bridge network → docker TCP proxy
   (172.31.255.1:2375) → `QM_BASE_PORT=18080 qm up`. Idempotent; `qm up`
   itself takes several minutes and may recreate core even when running.
6. **Leftovers cleaned**: orphan headless chrome (:9333) killed; tmp artifacts
   (webui-bundle.tmp.js, cookies.tmp, .chrome-tmp, chrome-headless.log) trashed.

## Root cause kept (not fixed)

Docker embedded DNS on this WSL host: **external name resolution works, peer
container-name resolution on custom bridge networks fails** (verified:
`docker run --network qm-sketchpop postgres:16 getent hosts qm-sketchpop-pg`
exit 2, while default-bridge `getent hosts google.com` resolves). This is why
the patched CLI pins static IPs + --add-host. Fixing means touching host DNS
on a box running the Buzz relay in prod — deferred until wanted.

## Outstanding (accepted for a test drive)

- Host Docker peer-DNS root cause (WSL) — workaround in place.
- No Fly path (trial ended): `qm doctor`, fly deploy blocked.
- Real sign-in (OIDC/auth broker) deliberately not configured; portal runs
  the dev-local bypass (principal `luis`).
- Slack surface not requested.
- No systemd auto-start unit; run `~/qm-deployment/start.sh` after boot.
