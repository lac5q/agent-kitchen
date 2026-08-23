---
name: "maeve-u1-codex-hermes-stability-2026-08-23"
title: "maeve-u1 Codex/Hermes stability check — 2026-08-23"
description: "Local operational diagnosis of WSL host stability, Codex/Hermes processes, memory pressure, and service restart loops."
publishedAt: "2026-08-23"
tags: ["operations", "maeve-u1", "codex", "hermes", "wsl"]
keywords: ["maeve-u1", "Codex", "Hermes", "crash", "OOM", "droid.service", "WSL"]
author: "Pi"
source_session: "01a03067-1309-794c-98be-4f17bfb74178"
model: "gpt-5.6-luna"
sources:
  - "label:maeve-u1-local-journal"
  - "label:maeve-u1-process-snapshot"
derived_from: []
regen_prompt: "Re-run the host uptime, journal, coredump, systemd service, process, and memory checks on maeve-u1, then update this diagnosis with current evidence."
---

## Finding

As of 2026-08-23 13:56–13:58 PDT, maeve-u1 is **not currently rebooting or kernel-crashing**. It has been up since 2026-08-18 13:02 (about five days). The Codex app-server process has the same age and is still running. The Hermes gateway and its spawned Hermes servers are also running.

There is, however, a serious **service-level restart loop**: droid.service has Restart=always and has restarted more than 50,950 times since this boot, roughly every 10–15 seconds. Its log says Failed to resolve relay config for remote access. This is separate from the Codex app-server and Hermes gateway processes, but it can make the machine feel unstable and consumes resources.

## Evidence

- Current memory: 11 GiB total, 4.8 GiB available; 3.9 GiB swap in use.
- user-1001.slice: about 10.66 GiB current memory, 11.24 GiB peak, 4.0 GiB current swap, 7.79 GiB swap peak.
- 20 hermes processes are present, totaling approximately 2.5 GiB RSS; Codex processes total approximately 750 MiB RSS.
- hermes-gateway.service is active, but Slack Socket Mode repeatedly reports invalid_auth; this is an integration/auth failure, not a host crash.
- Current and prior kernel journals contain no OOM-killer, kernel panic, lockup, or Codex/Hermes coredump evidence.
- The previous WSL instance ended via a clean systemd poweroff sequence. WSL did report shutdown/boot timing problems and repeated Xorg signal-6 crash captures; those are WSLg/display issues, not evidence that Codex or Hermes crashed the kernel.

## Assessment

The best-supported diagnosis is **not “Codex and Hermes are crashing the machine.”** It is: the WSL guest is currently alive but under meaningful memory/swap pressure, while droid.service is in a high-frequency crash/restart loop. The last guest restart was a deliberate/clean WSL poweroff followed by boot, with WSLg/Xorg problems visible around the transition.

## Recommended next actions

1. Stop or repair the droid.service relay-config loop.
2. Refresh the invalid Hermes Slack credentials if Slack integration is expected to work.
3. Reduce concurrent Hermes profiles or increase the WSL memory budget if swap pressure continues.
4. Recheck journalctl -k, systemctl --user show droid.service, and memory/swap after the droid loop is resolved.
