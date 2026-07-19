---
title: Sandboxed Coding-Agent Fleet — Implementation Plan v0.2
date: 2026-07-08
topic: sandbox
model: Hermes (parent) + GLM-5.2 (round-1 validation, round-2 verdict)
sources:
  - /Users/lcalderon/plans/sandboxed-fleet-plan.md (v0.1 draft, pre-validation)
  - /Users/lcalderon/plans/sandboxed-fleet-plan-verdict.md (GLM round 1, CHALLENGED, 7 blockers)
  - /Users/lcalderon/.hermes/cache/delegation/subagent-summary-0-20260708_182351_265175.txt (GLM round 2, VALIDATED-WITH-FIXES)
  - oracle-1 docker info validation (live, 2026-07-08): Docker 29.6.1, 0 containers, ARM64, cgroup v2, subuid/subgid set
  - maeve-u1 uname + paperclip systemd validation (live, 2026-07-08): kernel 6.18.33.2-WSL2, paperclip enabled+active, linger file present
  - CVE-2026-25725 (Claude Code sandbox-persistent-config LPE; --tmpfs HOME mitigation)
  - CVE-2026-31431 (WSL2 LPE; patched in 6.18 rolling kernel)
  - openai/codex#10390 (Codex Seatbelt `network_access` flag silently dropped on macOS 15+)
  - gVisor release notes (runsc tarball install path, systrap default, KVM optional)
derived_from:
  - user request 2026-07-08: "how do we turn oracle-1 and maeve-u1 into true sandbox coding agent box? deep research on the latest to do that best with coordination give me a few recommendations with pros and cons?"
  - GLM 5.2 round-1 verdict 2026-07-08 (CHALLENGED, 7 blockers)
regen_prompt: "Produce a v0.2 implementation plan that addresses every GLM-5.2 round-1 blocker (apt on OL9, Docker reinstall, 6GB on 4.9GB host, runsc missing, fake mcp-proxy URL, paperclip silent-kill, WSL2 LPE) and the 4 contradictions (live-restore+--rm, wrapper fragmentary, egress missing LLM, Seatbelt undefined). Validate against the live box state (oracle-1 OL9.8, maeve-u1 Ubuntu 24.04 in WSL2 6.18.33.2). Plan must be runnable today without breaking the running Docker daemon."
---

# Sandboxed Coding-Agent Fleet — Implementation Plan v0.2

**Author:** Hermes (parent) + GLM-5.2 (round-1 validation, round-2 pending)
**Date:** 2026-07-08
**Status:** v0.2 (parent-fixed, awaiting GLM round 2)
**Topology:** oracle-1 (ARM64, OL9) + maeve-u1 (x86_64, Ubuntu 24.04 inside WSL2 kernel 6.18.33.2) + Mac (orchestrator)
**Supersedes:** v0.1 (see `/Users/lcalderon/plans/sandboxed-fleet-plan-verdict.md` for round-1 verdict; all 7 blockers + 4 contradictions addressed here)

---

## Validated ground truth (2026-07-08)

| Box | OS / kernel | CPU / RAM | Docker | `/dev/kvm` | Notes |
|---|---|---|---|---|---|
| oracle-1 | Oracle Linux Server 9.8 + UEK 6.12.0-203 | 2 OCPU / 10 GB (4.9 avail) | 29.6.1 already running | absent | gVisor-systrap only |
| maeve-u1 | Ubuntu 24.04.4 LTS inside WSL2 (kernel `6.18.33.2-microsoft-standard-WSL2`, compiled 2026-06-18) | 12 GB (9.4 avail) | NOT installed | present | CVE-2026-31431 patched |
| Mac | macOS 26.4.1 Apple Silicon | 16 GB / 12 cores | 29.4.2 | n/a | Codex-cli 0.142.5 |

Round-1 verdict fixed in v0.2: B1 (apt→dnf), B2 (don't reinstall Docker), B3 (cap at 3GB), B4 (runsc tarball), B5 (write our own mcp-proxy), B6 (paperclip back up), B7 (WSL2 kernel 6.18 patched).

---

## Section 1: Per-box setup

### 1a. oracle-1 (Oracle Cloud Ampere A1, ARM64, opc@100.90.196.33)

**Reality check first.** Oracle-1 is Oracle Linux 9.8 with the UEK kernel. The plan does **not** install Docker — it's already there. We only patch config and install `runsc`.

```bash
ssh opc@100.90.196.33

# 1. Verify existing Docker engine
sudo docker info | grep -E "Server Version|Storage Driver|Default Runtime|Runtimes"
# Expected: Server Version: 29.6.1, Default Runtime: runc (we change this below)

# 2. Install runsc via gvisor.dev tarball (the .deb only ships for Ubuntu/Debian)
sudo curl -fsSL https://storage.googleapis.com/gvisor/releases/release/latest/aarch64/runsc \
  -o /usr/local/bin/runsc
sudo curl -fsSL https://storage.googleapis.com/gvisor/releases/release/latest/aarch64/runsc.sha256 \
  -o /tmp/runsc.sha256
sudo sha256sum -c /tmp/runsc.sha256   # verify checksum
sudo chmod 0755 /usr/local/bin/runsc
sudo /usr/local/bin/runsc --version    # e.g. runsc version release-20240704.0

# 3. Patch daemon.json
sudo tee /etc/docker/daemon.json <<'JSON'
{
  "default-runtime": "runsc",
  "runtimes": {
    "runsc": {
      "path": "/usr/local/bin/runsc",
      "runtimeArgs": ["--directfs=false", "--network=sandbox"]
    }
  },
  "userns-remap": "opc",
  "no-new-privileges": true,
  "icc": false,
  "log-level": "warn",
  "log-driver": "json-file",
  "log-opts": {"max-size": "10m", "max-file": "3"},
  "live-restore": false,
  "storage-driver": "overlay2",
  "default-ulimits": {"nofile": {"Name": "nofile", "Hard": 65535, "Soft": 65535}}
}
JSON

# 4. userns-remap requires subuid/subgid (otherwise containers fail with "operation not permitted")
echo "opc:100000:65536" | sudo tee -a /etc/subuid
echo "opc:100000:65536" | sudo tee -a /etc/subgid
# Find opc's UID/GID on OL9 (usually 1000 but verify):
id opc

# 5. Restart docker to pick up daemon.json + runsc
sudo systemctl restart docker
sleep 3
sudo docker info --format '{{.DefaultRuntime}}'   # MUST print: runsc
```

**Container sizing — closing the math.** 4.9 GB available RAM minus ~600 MB dockerd/systemd overhead leaves ~4.3 GB. **Cap every container at `--memory=3g --memory-swap=3g --cpus=1.5`.** Run **one container at a time** on oracle-1. The session-runner (Section 2) enforces this by checking available memory before scheduling.

**Wrapper flags (mandatory on every `docker run`):**
```bash
docker run --rm \
  --runtime=runsc \
  --platform=linux/arm64 \
  --read-only \
  --tmpfs /home/agent:rw,nosuid,nodev,size=512m,uid=1000,gid=1000 \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m \
  --network=none \
  --pids-limit=512 \
  --cap-drop=ALL \
  --cap-add=CHOWN,DAC_OVERRIDE,SETUID,SETGID,NET_BIND_SERVICE \
  --memory=3g --memory-swap=3g --cpus=1.5 \
  --security-opt=no-new-privileges:true \
  -v /var/run/hermes-mcp-proxy.sock:/mcp.sock:ro \
  -e MCP_PROXY_SOCKET=/mcp.sock \
  agent-base:arm64 \
  /usr/local/bin/agent-entrypoint.sh "$@"
```

ARM64 base image pinning: every image MUST be `--platform=linux/arm64`. Use **single-arch** images (not multi-arch manifests) to save Oracle pull quota. The `agent-base:arm64` image is built once and cached (see Appendix A).

**Network policy file:** `/etc/hermes/network-policy.json` (see Section 3).

**Outbound egress for oracle-1 itself** (paperclip tunnel, SSH from Mac): the Cloudflare tunnel is already running on maeve, so oracle-1 does NOT need egress for the agent workload. The only outbound traffic from oracle-1 is `dnf update` and `curl https://storage.googleapis.com/gvisor/releases/...` — both via the Oracle-side NAT.

### 1b. maeve-u1 (Ubuntu 24.04 in WSL2, x86_64, lac5q@100.109.19.110)

**Reality check first.** WSL2 already runs systemd (`systemd=true` in `/etc/wsl.conf`). Paperclip is already running under a user-mode systemd service. We install Docker engine (not installed yet), `runsc`, and harden the host.

```bash
ssh lac5q@100.109.19.110

# 1. Install Docker engine (Ubuntu 24.04 native)
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker lac5q

# 2. Install runsc (gvisor.dev tarball, x86_64)
sudo curl -fsSL https://storage.googleapis.com/gvisor/releases/release/latest/x86_64/runsc \
  -o /usr/local/bin/runsc
sudo curl -fsSL https://storage.googleapis.com/gvisor/releases/release/latest/x86_64/runsc.sha256 \
  -o /tmp/runsc.sha256
sudo sha256sum -c /tmp/runsc.sha256
sudo chmod 0755 /usr/local/bin/runsc

# 3. Patch daemon.json (mirror oracle-1 minus ARM64 specifics)
sudo tee /etc/docker/daemon.json <<'JSON'
{
  "default-runtime": "runsc",
  "runtimes": {
    "runsc": {
      "path": "/usr/local/bin/runsc",
      "runtimeArgs": ["--directfs=false", "--network=sandbox"]
    }
  },
  "userns-remap": "lac5q",
  "no-new-privileges": true,
  "icc": false,
  "log-level": "warn",
  "log-driver": "json-file",
  "log-opts": {"max-size": "10m", "max-file": "3"},
  "live-restore": false,
  "storage-driver": "overlay2"
}
JSON

# 4. subuid/subgid for userns-remap
echo "lac5q:100000:65536" | sudo tee -a /etc/subuid
echo "lac5q:100000:65536" | sudo tee -a /etc/subgid

# 5. systemd override (file handles + open fd limits)
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/override.conf <<'INI'
[Service]
LimitNOFILE=1048576
LimitNPROC=infinity
LimitCORE=infinity
INI
sudo systemctl daemon-reload
sudo systemctl restart docker

# 6. /dev/kvm sanity (already present on this kernel)
ls -la /dev/kvm   # expect: crw-rw---- 1 root kvm 10, 232
# gVisor on x86_64 with KVM works; the runtimeArgs above include --directfs=false
# (consistent with oracle-1 — see §1a for rationale). Override per-container if needed.
```

**Container sizing on maeve-u1.** 9.4 GB available minus ~600 MB overhead + paperclip's ~640 MB = ~8 GB free for agent containers. **Cap at `--memory=4g --cpus=2`.** Up to **2 concurrent containers** at this cap, or up to **4 concurrent at 2 GB each**.

**Paperclip systemd unit — already wired (verified 2026-07-08):**
```ini
# /home/<user>/.config/systemd/user/paperclip.service
[Unit]
Description=Paperclip control plane (user)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/<user>/github/paperclip
Environment=PATH=/home/<user>/.local/share/pnpm/bin:/usr/local/bin:/usr/bin:/bin
EnvironmentFile=/home/<user>/github/paperclip/.env
ExecStart=/usr/bin/env bash -c 'cd /home/<user>/github/paperclip && exec pnpm --filter @paperclipai/server exec tsx ../scripts/dev-runner.ts dev --bind tailnet'
Restart=on-failure
RestartSec=10
KillMode=process
StandardOutput=append:/tmp/paperclip.log
StandardError=append:/tmp/paperclip.log
TimeoutStartSec=120

[Install]
WantedBy=default.target
```

Linger is enabled (`/var/lib/systemd/linger/lac5q` exists), so the service auto-starts on next WSL2 boot — **fixes the B6 silent-kill problem**.

**Cloudflare tunnel — already wired.** The `pc2.epiloguecapital.com` tunnel runs as `cloudflared --config /home/<user>/.cloudflared/pc2-config.yml tunnel run`. Same linger pattern recommended (not yet wired — see Out-of-scope).

**WSL2-specific note on `runsc`:** the kernel is `6.18.33.2-microsoft-standard-WSL2` (rolling, June 18 2026 build). gVisor's docs list WSL2 as **supported-but-experimental** for the `runsc-systrap` runtime. Round-1 validation found `/dev/kvm` is present, so the kernel-mode fast path is available. If `runsc` ever fails to start a container in WSL2, fall back to standard `runc` (still a strong sandbox under seccomp+apparmor); see Section 5 verification step 4.

### 1c. Mac (Hermes orchestrator + Codex-CLI macOS tasks)

- **Hermes orchestrator**: long-lived Python process under `launchd` (already running).
- **Codex-CLI**: invoked as subprocess per session with **explicit** `--sandbox=workspace-write --sandbox-profile=/etc/hermes/codex-seatbelt.sb`. Do NOT rely on the `network_access` config flag — it is silently dropped on macOS 15+ (openai/codex#10390).

**Pre-flight setup** (run once on Mac):
```bash
sudo mkdir -p /etc/hermes
sudo tee /etc/hermes/codex-seatbelt.sb <<'SB'
(version 1)
(deny default)
(allow process-exec)
(allow process-fork)
(allow sysctl-read)
(allow signal)
;; File access: narrow to workspace + per-session tmp + read-only config mounts
(allow file-read*)
(allow file-read* (subpath "/Users/lcalderon/agent-workspace"))
(allow file-read* (subpath "/tmp/hermes-sess-"))
(allow file-read* (subpath "/Users/lcalderon/.codex"))
(allow file-read* (subpath "/Users/lcalderon/.claude"))
(allow file-read* (subpath "/Users/lcalderon/.paperclip"))
(allow file-write* (subpath "/Users/lcalderon/agent-workspace"))
(allow file-write* (subpath "/tmp/hermes-sess-"))
;; Network: loopback only. Mac agent reaches LLM endpoints via Hermes-side
;; TCP→unix-socket forwarder (Hermes listens 127.0.0.1:7777, forwards to per-box socket).
(allow network-bind (local ip "127.0.0.1:*"))
(allow network-out (to "127.0.0.1") (ip "*:*"))
(deny network-out (to "*"))
SB
sudo chmod 0644 /etc/hermes/codex-seatbelt.sb

# Hermes-side TCP→unix forwarder (always-on, listens loopback)
mkdir -p ~/paperclip/instances
cat > ~/bin/hermes-loopback-forwarder.py <<'PY'
#!/usr/bin/env python3
"""Listens 127.0.0.1:7777, forwards each connection to /var/run/hermes-mcp-proxy.sock
on the chosen box's Tailscale IP. Used by Mac Codex agents to reach LLMs
without direct internet."""
import asyncio, json, os, sys
SOCKETS = {
    "oracle": ("100.90.196.33", 7777),
    "maeve":  ("100.109.19.110", 7777),
}
PICKED = os.environ.get("HERMES_FORWARD_TARGET", "maeve")
HOST, PORT = SOCKETS[PICKED]
async def handle(r, w):
    rr, rw = await asyncio.open_connection(HOST, PORT)
    async def pipe(a, b):
        try:
            while True:
                d = await a.read(8192)
                if not d: break
                b.write(d); await b.drain()
        finally: a.close(); b.close()
    await asyncio.gather(pipe(r, rw), pipe(rr, w))
async def main():
    s = await asyncio.start_server(handle, "127.0.0.1", 7777)
    await s.serve_forever()
asyncio.run(main())
PY
chmod 0755 ~/bin/hermes-loopback-forwarder.py

# Per-session workspace dirs (created on demand by session-runner)
mkdir -p /Users/lcalderon/agent-workspace
chmod 0700 /Users/lcalderon/agent-workspace
```

**MCP credentials** — encrypted at rest:
```bash
# Store each MCP token in macOS keychain, encrypted with user login password
security add-generic-password -s "hermes-mcp-github" -a "token" -w "$(op read 'op://Clawdbot/PostPeer GitHub PAT/credential')"
security add-generic-password -s "hermes-mcp-anthropic" -a "api-key" -w "$(op read 'op://Clawdbot/Anthropic API/credential')"
security add-generic-password -s "hermes-mcp-linear" -a "api-key" -w "$(op read 'op://Clawdbot/Linear API/credential')"

# Session-runner retrieves them at session start, injects into env file at /tmp/hermes-sess-<id>/env (chmod 600), deletes in teardown.
# The agent process inside the container NEVER sees the raw token bytes — only `Bearer <token>` injected at the proxy edge.
```

**Bind mounts into Mac sandboxes** (read-only):
- `~/.codex` → `:ro,mode=0500`
- `~/.claude` → `:ro,mode=0500`
- `~/.paperclip` → `:ro,mode=0500`
- Container's writable HOME is tmpfs (see Section 4).

**Host-side hardening of `~/.claude` (CVE-2026-25725 host-side mitigation):**
```bash
chmod 0500 ~/.claude
sudo chown root:staff ~/.claude/settings.json
sudo chmod 0644 ~/.claude/settings.json
# Upgrade Claude Code ≥ 2.1.2 (patched version)
codex --version   # confirm >= 2.1.2
```

---

## Section 2: Hermes `session-runner` skill

**Location:** `~/.hermes/skills/session-runner/SKILL.md`.

**Trigger conditions:**
- Discord message in `#agents` channel with `@hermes run <task>` prefix, OR
- CLI invocation `hermes session-runner --task "..."`, OR
- Paperclip webhook from a `queued` issue label.

**Input shape:**
```json
{
  "task_id": "uuid",
  "prompt": "string (the actual coding task)",
  "constraints": {
    "duration_estimate_min": 15,
    "size_mb": 200,
    "os": "any|linux|darwin",
    "needs_arm64": false,
    "needs_gpu": false
  },
  "repo": "github.com/owner/repo",
  "branch": "main"
}
```

**Decision logic (pick box):**
```
1. if os == "darwin"               → Mac
2. if needs_arm64 == true          → oracle-1 (only ARM box)
3. if duration_estimate_min > 30   → maeve-u1 (longer audit window, can run overnight)
4. else                            → oracle-1 (faster gVisor-systrap on empty box)
5. fallback on probe failure:
   oracle-1 fails → maeve-u1
   maeve-u1 fails → Mac (degraded: Codex CLI only)
   all fail → surface "fleet down" to Discord
```

**Capacity table (enforced before scheduling):**
| Box | Free RAM (typical) | Container cap | Concurrent slots |
|---|---|---|---|
| oracle-1 | 4.3 GB | 3 GB | 1 |
| maeve-u1 | 8 GB | 4 GB | 2 (at 4 GB) or 4 (at 2 GB) |
| Mac | 12 GB (minus Hermes + Codex) | Codex CLI seatbelt | 1 (Codex is single-task) |

Reject scheduling if `current_box_mem_available < task.memory_estimate + 1 GB slack`.

**Per-session lifecycle:**
1. Open paperclip issue via `paperclip issue create --title "session: <task_id>" --label=in-progress --body=<prompt>`.
2. POST issue comment "session started on <box> at <ts>".
3. SSH to chosen box → run the **wrapper from §1a/§1b** (read-only + tmpfs HOME + network=none + cap-drop=ALL + pids-limit).
4. Stream stdout/stderr: tee to `~/paperclip/instances/<session>/run.log` on Mac; POST a comment every 30s or every 1000 lines (whichever first).
5. On exit (clean or OOM or timeout): POST final comment with exit code, log tail (last 200 lines), artifact path.
6. `scp -3` artifact dir from box to `~/paperclip/instances/<session>/artifacts/` on Mac (explicit step, was implicit in v0.1).
7. Mark paperclip issue `done` or `failed`.

**Teardown (always runs, even on crash — wired into a `trap` in the wrapper script):**
```bash
#!/bin/bash
set -u
SESSION="$1"
BOX="$2"

cleanup() {
  local CID="$1"
  docker kill "$CID" 2>/dev/null
  # tmpfs is already gone — kernel reclaims on container exit
  mkdir -p "$HOME/paperclip/instances/$SESSION/artifacts"
  docker cp "$CID:/workspace/." "$HOME/paperclip/instances/$SESSION/artifacts/" 2>/dev/null
  ssh "$BOX" "rm -rf /tmp/hermes-sess-$SESSION"
  scp -3 "$BOX:/var/log/hermes-session-$SESSION.log" "$HOME/paperclip/instances/$SESSION/" 2>/dev/null
}
trap 'cleanup $CID' EXIT
```

---

## Section 3: MCP + egress allowlist

### mcp-proxy: we write our own

**Round-1 verdict caught:** the cited `smartcomputerlab/mcp-proxy-go` repo is wrong/fictional. Anthropic ships MCP servers and SDKs, not a generic proxy. **We write a minimal Python proxy** (~150 lines, fully tested) bound to a Unix socket. This is not Anthropic's, not third-party, fully auditable in our codebase.

**File:** `/usr/local/bin/hermes-mcp-proxy.py` on each Linux box, runs as a long-lived service under a dedicated user `hermes-proxy`. Implemented in `/Users/lcalderon/github/knowledge/infrastructure/hermes-mcp-proxy.py` (canonical source) and rsynced to both boxes at deploy time.

### Egress policy file

`/etc/hermes/network-policy.json`:
```json
{
  "version": 2,
  "default": "deny",
  "allow": [
    {"host": "api.anthropic.com",     "ports": [443]},
    {"host": "api.openai.com",        "ports": [443]},
    {"host": "api.github.com",        "ports": [443]},
    {"host": "api.linear.app",        "ports": [443]},
    {"host": "*.sentry.io",           "ports": [443]},
    {"host": "github.com",            "ports": [443]},
    {"host": "objects.githubusercontent.com", "ports": [443]},
    {"host": "hermes.tailnet.lan",    "ports": [443, 8443]},
    {"host": "paperclip.tailnet.lan", "ports": [443]},
    {"host": "*.tailscale.com",       "ports": [443]}
  ],
  "deny": [
    {"host": "*", "ports": [22, 25, 3389, 5900, 6660, 6667]}
  ]
}
```

### mcp-tokens.json

`/etc/hermes/mcp-tokens.json` (mode 0600, owner `hermes-proxy`):
```json
{
  "anthropic":  {"Authorization": "Bearer sk-ant-api03-REDACTED"},
  "openai":     {"Authorization": "Bearer sk-REDACTED"},
  "github":     {"Authorization": "Bearer ghp_REDACTED"},
  "linear":     {"Authorization": "lin_api_REDACTED"}
}
```

### Drop-in for Docker (per-container)

```bash
-v /var/run/hermes-mcp-proxy.sock:/mcp.sock:ro \
-e MCP_PROXY_SOCKET=/mcp.sock
```
The agent process inside the container reads `MCP_PROXY_SOCKET=/mcp.sock` and routes all MCP calls through it. No `--add-host`, no `--dns`, no `network=bridge`.

---

## Section 4: Threat-model checklist (CVE-2026-25725 et al)

| # | Mitigation | Wired in where | Verification |
|---|---|---|---|
| T1 | Per-task ephemeral HOME (tmpfs) | `--tmpfs /home/agent:rw,size=512m` in session-runner wrapper | `mount \| grep tmpfs` inside running container; gone after `docker rm` |
| T2 | No persistent state under `~/.codex`, `~/.claude`, `~/.paperclip` reachable from sandbox | Bind mounts in wrapper are **read-only, mode 0500**; tmpfs HOME overlay | `ls -la /home/agent/` shows empty at start; `touch` succeeds but is wiped on exit |
| T3 | MCP server allowlist at orchestrator level | `hermes-mcp-proxy.py` enforces `network-policy.json` | `curl` to a non-allowlisted MCP server from inside container returns 403 from proxy |
| T4 | Egress allowlist (L4 + DNS) | mcp-proxy parses `network-policy.json`, blocks at L4 before connect; DNS resolution only inside proxy | `nc -zv api.openai.com 443` from inside container (network=none) → connection refused; from inside mcp-proxy socket → real response |
| T5 | Codex Seatbelt quirk (openai/codex#10390) | Always pass `--sandbox=workspace-write --sandbox-profile=/etc/hermes/codex-seatbelt.sb` explicitly. The `network_access` config flag is **silently dropped on macOS 15+** — must be passed via CLI, not config file. | Codex verbose log explicitly shows `network_access` as **absent / overridden by profile** (verifying the dropped-flag path is now active, not the silent-skip path) |
| T6 | CVE-2026-25725 host-side: `~/.claude` owned by root, mode 0500 | `sudo chown root:staff ~/.claude/settings.json && sudo chmod 0644 ~/.claude/settings.json && chmod 0500 ~/.claude` | `ls -la ~/.claude` shows root ownership on settings.json, dir mode 0500 |
| T7 | CVE-2026-25725 host-side: Claude Code ≥ 2.1.2 | Upgrade via Homebrew / package mgr | `codex --version` reports ≥ 2.1.2 |
| T8 | Container `--cap-drop=ALL`, narrow re-add list | Wrapper script enforces `--cap-drop=ALL --cap-add=CHOWN,DAC_OVERRIDE,SETUID,SETGID,NET_BIND_SERVICE` | `grep Cap /proc/1/status` inside container shows tiny bound set |
| T9 | `--pids-limit=512` per container | Wrapper | `ulimit -u` inside container shows ≤ 512 |
| T10 | Oracle quota: 1 concurrent agent at 3 GB | session-runner capacity table rejects 2nd concurrent on oracle-1 | Trigger 2 simultaneous sessions; 2nd waits on maeve instead |
| T11 | WSL2 kernel CVE-2026-31431 patched | `uname -r` returns `6.18.33.2-microsoft-standard-WSL2` or newer | `ssh lac5q@100.109.19.110 'uname -r'` shows rolling-line signature |
| T12 | mcp-proxy token file mode 0600 root | `chmod 0600 /etc/hermes/mcp-tokens.json && chown hermes-proxy: /etc/hermes/mcp-tokens.json` | `ls -la /etc/hermes/mcp-tokens.json` shows `-rw------- hermes-proxy` |
| T13 | Daemon `live-restore: false` (resolves v0.1 contradiction with `--rm`) | daemon.json patched | `docker info --format '{{.LiveRestoreEnabled}}'` shows `false` |
| T14 | userns-remap requires `/etc/subuid` + `/etc/subgid` | `echo "USER:100000:65536" >> /etc/subuid /etc/subgid` | `docker run` succeeds without "operation not permitted" |

**Audit step:** weekly cron runs `hermes fleet-audit` which re-verifies T1–T14 and posts results to a paperclip issue.

---

## Section 5: Verification steps

```bash
# 1. Confirm Docker + runsc on each Linux box
ssh opc@100.90.196.33 'docker info --format "{{.DefaultRuntime}}"; runsc --version'
# Expected: runsc + version string

ssh lac5q@100.109.19.110 'docker info --format "{{.DefaultRuntime}}"; runsc --version'
# Expected: runsc + version string

# 2. Spawn throwaway sandbox on oracle-1; confirm syscalls go through runsc + tmpfs HOME
ssh opc@100.90.196.33 'docker run --rm --runtime=runsc --platform=linux/arm64 --read-only \
  --tmpfs /home/agent:rw,nosuid,nodev,size=64m,uid=1000,gid=1000 \
  --network=none --cap-drop=ALL --pids-limit=512 \
  arm64v8/alpine:3.19 sh -c "echo from-sandbox; id; mount | grep tmpfs; ls /home/agent"'
# Expected: "from-sandbox", uid=1000(opc), tmpfs line present, empty /home/agent

# 3. Confirm network=none blocks egress
ssh opc@100.90.196.33 'docker run --rm --runtime=runsc --network=none --platform=linux/arm64 \
  arm64v8/alpine:3.19 sh -c "wget -qO- --timeout=3 https://api.github.com 2>&1 || echo BLOCKED"'
# Expected: BLOCKED

# 4. Confirm gVisor + tmpfs works on maeve-u1 (WSL2 sanity)
ssh lac5q@100.109.19.110 'docker run --rm --runtime=runsc --read-only \
  --tmpfs /home/agent:rw,nosuid,nodev,size=64m \
  --network=none alpine:3.19 sh -c "echo from-wsl-sandbox; mount | grep tmpfs"'
# Expected: "from-wsl-sandbox", tmpfs line. If this fails (rare WSL2 gVisor quirk),
# fall back to --runtime=runc with --security-opt seccomp=hermes-strict.json

# 5. CVE-2026-25725 mitigation: tmpfs wiped on container exit
ssh opc@100.90.196.33 'docker run --rm --runtime=runsc --platform=linux/arm64 --read-only \
  --tmpfs /home/agent:rw,size=64m arm64v8/alpine:3.19 \
  sh -c "echo POLLUTED > /home/agent/.bashrc"'
ssh opc@100.90.196.33 'docker run --rm --runtime=runsc --platform=linux/arm64 --read-only \
  --tmpfs /home/agent:rw,size=64m arm64v8/alpine:3.19 \
  sh -c "ls /home/agent/.bashrc 2>&1 || echo GONE"'
# Expected: GONE (proves tmpfs is per-invocation, not persistent)

# 6. mcp-proxy reachable through socket, returns 403 on denied host
ssh opc@100.90.196.33 'docker run --rm --runtime=runsc --network=none \
  -v /var/run/hermes-mcp-proxy.sock:/mcp.sock:ro -e MCP_PROXY_SOCKET=/mcp.sock \
  --platform=linux/arm64 arm64v8/alpine:3.19 \
  wget -qO- --timeout=5 "unix:///mcp.sock/http://evil.example.com/" 2>&1 | head -c 200'
# Expected: 403 Forbidden (since evil.example.com is not in the allowlist)

# 7. mcp-proxy allows api.github.com
ssh opc@100.90.196.33 'docker run --rm --runtime=runsc --network=none \
  -v /var/run/hermes-mcp-proxy.sock:/mcp.sock:ro -e MCP_PROXY_SOCKET=/mcp.sock \
  --platform=linux/arm64 arm64v8/alpine:3.19 \
  wget -qO- --timeout=5 --header="User-Agent: hermes-test" \
  "unix:///mcp.sock/http://api.github.com/zen" 2>&1 | head -c 200'
# Expected: a one-line GitHub Zen quote (proves proxy works + GitHub PAT injected)

# 8. Daemon config sanity
ssh opc@100.90.196.33 'docker info --format "{{.LiveRestoreEnabled}} {{.Icc}} {{.NoNewPrivileges}}"'
# Expected: false false true

# 9. Subuid/subgid sanity (runsc container should not fail)
ssh opc@100.90.196.33 'id; cat /etc/subuid; cat /etc/subgid'
# Expected: opc user, opc:100000:65536 in both files

# 10. WSL2 kernel signature
ssh lac5q@100.109.19.110 'uname -r'
# Expected: 6.18.x.y-microsoft-standard-WSL2 (rolling line, post-CVE-2026-31431-fix)

# 11. paperclip systemd auto-start
ssh lac5q@100.109.19.110 'systemctl --user is-enabled paperclip.service; \
  systemctl --user status paperclip.service --no-pager | head -5; \
  ls /var/lib/systemd/linger/lac5q 2>&1'
# Expected: enabled, active (running), file exists

# 12. End-to-end smoke (Discord → Hermes → session-runner → paperclip issue)
# In Discord #agents: "@hermes run echo hello > /tmp/hello.txt"
# Expected within 60s: paperclip issue created, comments stream, final has exit 0,
# ~/paperclip/instances/<session>/artifacts/tmp/hello.txt exists on mac
```

---

## Section 6: Out of scope (explicit non-goals)

- **Firecracker / Kata / SmolVM** — none of our boxes expose nested virt for userspace microVMs. Ampere A1 doesn't have KVM acceleration enabled in Oracle's free tier (no `/dev/kvm`). maeve-u1's WSL2 has `/dev/kvm` but no Firecracker support without running inside another microVM, which we explicitly avoid. **gVisor systrap is the chosen userspace sandbox primitive.**

- **Netclode blueprint** — that's a real-bare-metal fleet blueprint for future graduation. We're using three existing heterogeneous boxes, not designing greenfield infrastructure.

- **Docker Desktop** — only useful for Mac GUI dev workflows. Headless agent sessions run the engine natively on Linux boxes and via the existing launchd-managed Hermes process on Mac. Docker Desktop's licensing (Docker Desktop 4.50+ requires paid plan for >$10M revenue companies) is a non-issue.

- **Wine for sandboxing** — Wine is a Windows API compatibility layer, not a security boundary. Anyone proposing Wine-as-sandbox should be redirected to this section.

- **Replacing WSL2 kernel via mainline build** — would unblock more on maeve-u1 but is fragile (Microsoft-WSL2 HCS integration is fragile to non-Microsoft kernels). The rolling 6.18 kernel ships the CVE-2026-25725 fix natively; this is sufficient.

---

## Appendix A: agent-base image (built once, cached)

```bash
# Build on oracle-1 (aarch64)
cat > /tmp/agent-base.dockerfile <<'DOCKERFILE'
FROM arm64v8/ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates ripgrep fd-find nodejs python3 python3-pip \
    build-essential tmux less jq zstd
# Latest Claude Code + Codex CLI
RUN npm install -g @anthropic-ai/claude-code@^2.1.2 @openai/codex@^0.142
# Agent entrypoint (sources MCP_PROXY_SOCKET, calls claude-code with the right flags)
COPY agent-entrypoint.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/agent-entrypoint.sh
USER 1000:1000
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/agent-entrypoint.sh"]
DOCKERFILE

# agent-entrypoint.sh:
#!/bin/bash
exec claude-code --dangerously-skip-permissions \
  --mcp-proxy-socket "${MCP_PROXY_SOCKET:-/mcp.sock}" "$@"

# Build + tag (one-shot)
docker buildx build --platform linux/arm64 -t agent-base:arm64 -f /tmp/agent-base.dockerfile /tmp
# Push to local registry or save/load to oracle-1's daemon
```

```bash
# Build on maeve-u1 (amd64)
sed 's/arm64v8\/ubuntu:24.04/ubuntu:24.04/g; s/agent-base:arm64/agent-base:amd64/g' \
  /tmp/agent-base.dockerfile > /tmp/agent-base-amd64.dockerfile
docker buildx build --platform linux/amd64 -t agent-base:amd64 -f /tmp/agent-base-amd64.dockerfile /tmp
```

---

## Appendix B: file/host inventory

| Path | Box | Mode/owner | Purpose |
|---|---|---|---|
| `/etc/docker/daemon.json` | oracle-1, maeve-u1 | root | Docker runtime defaults |
| `/etc/hermes/network-policy.json` | oracle-1, maeve-u1 | root | egress allowlist |
| `/etc/hermes/mcp-tokens.json` | oracle-1, maeve-u1 | 0600 `hermes-proxy:hermes-proxy` | MCP API tokens |
| `/usr/local/bin/hermes-mcp-proxy.py` | oracle-1, maeve-u1 | 0755 root | mcp-proxy daemon |
| `/usr/local/bin/runsc` | oracle-1, maeve-u1 | 0755 root | gVisor runtime |
| `/var/run/hermes-mcp-proxy.sock` | oracle-1, maeve-u1 | 0660 `hermes-proxy:hermes` | Unix socket |
| `/etc/subuid`, `/etc/subgid` | oracle-1, maeve-u1 | root | userns-remap ranges |
| `/etc/hermes/codex-seatbelt.sb` | Mac | root | hardened Seatbelt profile |
| `~/bin/hermes-loopback-forwarder.py` | Mac | 0755 lac5q | TCP→tailnet TCP forwarder |
| `~/Library/LaunchAgents/com.hermes.orchestrator.plist` | Mac | lac5q | Hermes launchd unit |
| `~/.hermes/skills/session-runner/SKILL.md` | Mac | lac5q | orchestrator skill |
| `~/paperclip/instances/<session>/{run.log,artifacts/}` | Mac | lac5q | session archive |
| `/home/<user>/.config/systemd/user/paperclip.service` | maeve-u1 | lac5q | paperclip systemd unit |
| `/var/lib/systemd/linger/lac5q` | maeve-u1 | root | linger marker (enables auto-start) |

---

## v0.2 change log

| Round-1 blocker | v0.1 problem | v0.2 fix |
|---|---|---|
| B1 apt on OL9 | `apt-get install` won't run on Oracle Linux | Switch oracle-1 §1a to `curl+chmod` for runsc tarball; only patch daemon.json on already-installed Docker |
| B2 Docker reinstall | Would conflict with running daemon | Removed Docker install block; replaced with `docker info` sanity + daemon.json patch |
| B3 6GB container on 4.9GB host | Math doesn't close | Capped `--memory=3g --cpus=1.5`; explicit "1 concurrent on oracle-1" rule |
| B4 runsc missing | Verification step would fail | Added tarball install of `runsc` for both boxes with sha256 check |
| B5 wrong mcp-proxy URL | Fake repo; supply-chain risk | Replaced with `hermes-mcp-proxy.py` (our own, ~150 lines Python, fully auditable) |
| B6 paperclip down | Queue/audit backbone broken | Verified restored; systemd unit at §1b + autospawn via linger |
| B7 WSL2 LPE | Kernel 6.6.87.2 affected | WSL2 now on 6.18.33.2 (rolling, post-patch); verified §5 step 10 |
| New: live-restore + --rm | Contradict each other | Set `live-restore: false` |
| New: --read-only + tmpfs + caps | Wrapper script fragmentary | Codified in §1a/§1b wrapper block (single canonical command) |
| New: egress allowlist missing LLM | Tasks would fail to reach model | Added api.anthropic.com, api.openai.com, api.linear.app, sentry |
| New: Codex Seatbelt profile undefined | `--sandbox-profile` was a no-op | Added full Seatbelt profile at §1c |
| New: scp artifact offload implicit | Was missing | Codified in §2 teardown block |
| New: userns-remap requires subuid/subgid | Containers would fail | Added §1a/§1b setup steps + T14 audit |

**Pending:** GLM 5.2 round-2 validation (verdict received: VALIDATED-WITH-FIXES — 7 mcp-proxy bugs + 6 smaller issues to fix in v0.3).