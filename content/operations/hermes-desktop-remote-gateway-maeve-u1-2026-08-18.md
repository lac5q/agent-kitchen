---
name: hermes-desktop-remote-gateway-maeve-u1
title: "Hermes Desktop remote gateway diagnosis on maeve-u1"
description: "Live diagnostic of Hermes services, Desktop SSH backends, exposed ports, and the separate Factory Droid relay failure on maeve-u1."
publishedAt: "2026-08-18"
tags: [hermes, hermes-desktop, remote-access, ssh, droid, troubleshooting, rca]
keywords: [maeve-u1, lac5q, remote gateway, Hermes Desktop, hermes serve, Factory Droid]
author: "Pi"
source_session: "01a01678-9c1a-7601-aa90-421523b32b93"
model: "gpt-5.6-luna"
sources:
  - "local:systemctl --user status hermes-gateway.service hermes-webui.service"
  - "local:/home/lac5q/.hermes/logs/gateway.log"
  - "local:/home/lac5q/.hermes/desktop-ssh/*/backend.lock.json"
  - "local:/home/lac5q/.factory/logs/droid-log-single.log"
  - "local:/home/lac5q/.hermes/hermes-agent/website/docs/user-guide/multi-connection-desktop.md"
derived_from: []
regen_prompt: "Re-run the live service, listener, Desktop SSH backend, and Factory Droid authentication checks on maeve-u1 and update this RCA with current evidence."
---

## RCA

### Scope

Live inspection of the Hermes installation on maeve-u1 (user lac5q) after Hermes Desktop failed to connect remotely. No credentials or tokens are included here.

### Findings

- The Hermes messaging gateway is healthy enough to run: hermes-gateway.service is active, PID 795, and Hermes Agent is v0.20.4 (2026.8.18). Its Telegram, Discord, and local API adapters reached connected/listening state.
- The Hermes API server is bound to loopback at 127.0.0.1:8642; it is not a Desktop remote-backend listener and is not reachable via the tailnet address.
- The legacy Hermes WebUI is active on port 8787 and is reachable on the tailnet, but unauthenticated requests receive HTTP 401. It is not the standard 9119 Desktop backend described by the current Hermes Desktop connection flow.
- Nothing is listening on port 9119. Therefore a Desktop connection configured as an HTTP Remote gateway for maeve-u1:9119 cannot work until a persistent dashboard/backend is started there.
- The SSH-style Desktop path did reach the machine and start three valid, lock-owned isolated hermes serve backends on ephemeral loopback ports 40049, 43909, and 46343. Their public status endpoint returned Hermes status JSON, and two currently have established WebSocket connections. The server-side SSH/backend spawn path is therefore not completely down.
- A separate droid.service is failing continuously. It is configured as the Factory Droid remote-access relay, not Hermes. At the time of inspection it had restarted 134 times and repeatedly logged "Failed to resolve relay config for remote access". Factory logs show the WorkOS session had ended, token refresh returned invalid_grant, and droid computer list failed with "Missing authorization token in HTTP headers".

### Likely hang-up

There are two distinct cases:

1. If the client is Factory/Droid Desktop: the expired/revoked WorkOS session is the direct blocker. The relay daemon cannot authenticate or resolve its relay configuration.
2. If the client is Hermes Desktop: use the SSH connection type for lac5q@maeve-u1. Do not enter user@host into the HTTP Remote gateway field. HTTP Remote gateway mode requires a URL for a running hermes serve/dashboard backend plus its session-token/OAuth authentication; this host currently has no listener on 9119.

### Recommended next actions

- In Hermes Desktop, confirm whether the entry is SSH or Remote gateway. For SSH, use lac5q@maeve-u1 on port 22 and test after removing/re-adding any stale failed entry. The host is reachable over the tailnet; use 100.109.19.110 if MagicDNS does not resolve maeve-u1 on the client.
- For HTTP Remote gateway mode, deploy a persistent authenticated Hermes dashboard/backend on a chosen port (9119 is the documented default) and point Desktop at its HTTP(S) URL. Do not point Desktop at 8642.
- If Factory/Droid remote access is intended, re-authenticate the Factory account in the Desktop/CLI, then restart droid.service and verify droid computer list. If it is not intended, stop/disable that service to end the restart storm.
- No service or configuration was changed during this inspection. The three lock-owned isolated Hermes backends were left running because their ownership records and live sockets indicate active Desktop sessions.

### Verification commands

- systemctl --user status hermes-gateway.service hermes-webui.service
- ss -ltnp (expect 127.0.0.1:8642, WebUI :8787, and ephemeral SSH backends; no :9119 unless configured)
- hermes gateway status
- droid computer list (currently fails until Factory authentication is repaired)
