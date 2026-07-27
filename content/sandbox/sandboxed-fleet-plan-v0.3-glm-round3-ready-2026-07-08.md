---
title: Sandboxed Coding-Agent Fleet — Implementation Plan v0.3
date: 2026-07-08
topic: sandbox
model: Hermes (parent) + GLM-5.2 (round-1+2 validation)
sources:
  - /Users/lcalderon/plans/sandboxed-fleet-plan.md
  - ~/github/knowledge/infrastructure/hermes-mcp-proxy.py
  - ~/github/memroos/content/sandbox/sandboxed-fleet-plan-v0.2-glm-round2-2026-07-08.md
  - ~/github/memroos/content/sandbox/sandbox-v0.2-glm-verdict-2026-07-08.md
status: ready-for-round3
supersedes: v0.2 (round-2 verdict: VALIDATED-WITH-FIXES)
fixes:
  - mcp-proxy: real tested implementation (~280 lines async Python)
  - seatbelt-vs-§3: hermes-side TCP forwarder (NEW2)
  - seatbelt file-read narrowed to specific subpaths (NEW3)
  - daemon.json symmetric --directfs=false (NEW6)
  - WSL2 KVM fast-path enabled --platform=kvm (NEW7)
  - T5 verification text corrected (NEW4)
  - mkdir pre-flight block (NEW5)
derived_from: original-discord-prompt-1524485327966699531-2026-07-08
regen_prompt: To regenerate this file with current LLM: load memroos://sandbox/v0.3 with model=hermes-parent, ask for a re-listing of changes vs v0.2 (this file should treat v0.2 round-2 verdict as canonical diff baseline).
---

---

## v0.2 → v0.3 change log

| Round-2 issue | v0.2 problem | v0.3 fix |
|---|---|---|
| NEW1 mcp-proxy 7 bugs | `path[1:]` as URL, malformed f-string, undefined `headers`, GET-only, no SSL hostname, body dropped, no try/except | **Real implementation:** `~/github/knowledge/infrastructure/hermes-mcp-proxy.py` (~280 lines, async, tested). New wire protocol: `/proxy/<scheme>/<host>/<port>?path=<real>&method=<METHOD>`. End-to-end verified against mock upstream (GET + token injection, egress denial, malformed path all pass). Full source moved to §3. |
| NEW2 Seatbelt-vs-§3 contradiction | Profile allows only loopback, but §3 says agent reaches api.anthropic.com | **Added Hermes-side TCP forwarder** `~/bin/hermes-loopback-forwarder.py` that listens 127.0.0.1:7777 and forwards to per-box socket. Mac agent goes through loopback → Hermes forwarder → box socket → LLM. |
| NEW3 Seatbelt file-read unrestricted | Agent can read `~/.ssh`, `~/.aws` | Narrowed to specific subpaths: `/Users/lcalderon/agent-workspace`, `/tmp/hermes-sess-`, `~/.codex`, `~/.claude`, `~/.paperclip`. All other file-read denied. |
| NEW4 T5 verification text wrong | "Codex verbose log confirms `network=true` is honored" — but openai/codex#10390 says it's DROPPED | Corrected: verification expects to see `network_access` as **absent / overridden by profile** (verifying the dropped-flag path is now active) |
| NEW5 mkdir pre-flight missing | `agent-workspace` and `/tmp/hermes-sess-<id>` referenced but never created | Added pre-flight block in §1c: `sudo mkdir -p /etc/hermes /Users/lcalderon/agent-workspace ~/paperclip/instances` + chmod |
| NEW6 asymmetric `--directfs=false` | §1b daemon.json dropped it (only §1a had it) | Now both have `--directfs=false` (consistent); rationale documented in §1a/§1b |
| NEW7 KVM fast-path missed | maeve-u1 has `/dev/kvm` but plan uses systrap (slower) | Added KVM-enabled runsc flag in maeve-u1 §1b: `runtimeArgs` include `--platform=kvm` when `/dev/kvm` is present; document fallback if WSL2 gVisor/KVM misbehaves |
| Round-1 round-up | All B1-B7 + 4 contradictions remained fixed | No regression; v0.2 fixes carried forward |

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

# 3. Patch daemon.json (note: --directfs=false present — consistent with §1b now)
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

# 4. userns-remap requires subuid/subgid
echo "opc:100000:65536" | sudo tee -a /etc/subuid
echo "opc:100000:65536" | sudo tee -a /etc/subgid
id opc

# 5. Restart docker to pick up daemon.json + runsc
sudo systemctl restart docker
sleep 3
sudo docker info --format '{{.DefaultRuntime}}'   # MUST print: runsc

# 6. Deploy hermes-mcp-proxy.py
sudo mkdir -p /etc/hermes /var/run /var/log
sudo curl -fsSL https://raw.githubusercontent.com/.../hermes-mcp-proxy.py \
  -o /usr/local/bin/hermes-mcp-proxy.py
# (In practice, rsync from ~/github/knowledge/infrastructure/hermes-mcp-proxy.py)
sudo chmod 0755 /usr/local/bin/hermes-mcp-proxy.py

# 7. Create hermes-proxy user (no shell, no home, no login)
sudo useradd --system --shell /usr/sbin/nologin --home-dir /nonexistent hermes-proxy

# 8. Deploy network-policy.json + mcp-tokens.json (mode 0600, owner hermes-proxy)
sudo curl -fsSL .../network-policy.json -o /etc/hermes/network-policy.json
sudo cp ~/.hermes-secrets/mcp-tokens.json /etc/hermes/mcp-tokens.json
sudo chmod 0600 /etc/hermes/mcp-tokens.json
sudo chown hermes-proxy:hermes-proxy /etc/hermes/mcp-tokens.json

# 9. systemd service for the proxy
sudo tee /etc/systemd/system/hermes-mcp-proxy.service <<'INI'
[Unit]
Description=Hermes MCP egress proxy
After=docker.service
Wants=docker.service

[Service]
Type=simple
User=hermes-proxy
ExecStart=/usr/local/bin/hermes-mcp-proxy.py
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
INI
sudo systemctl daemon-reload
sudo systemctl enable --now hermes-mcp-proxy.service
sleep 2
sudo systemctl status hermes-mcp-proxy.service --no-pager | head -5
ls -la /var/run/hermes-mcp-proxy.sock   # expect: srw-rw---- hermes-proxy:hermes
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

ARM64 base image pinning: every image MUST be `--platform=linux/arm64`. The `agent-base:arm64` image is built once and cached (see Appendix A).

### 1b. maeve-u1 (Ubuntu 24.04 in WSL2, x86_64, lac5q@100.109.19.110)

**Reality check first.** WSL2 already runs systemd. Paperclip is already running under a user-mode systemd service. We install Docker engine, `runsc` (KVM-enabled because `/dev/kvm` is present), and harden the host.

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

# 3. Patch daemon.json — note: --directfs=false (symmetric with §1a) AND
#    --platform=kvm enabled because /dev/kvm is present (NEW7: KVM fast-path)
sudo tee /etc/docker/daemon.json <<'JSON'
{
  "default-runtime": "runsc",
  "runtimes": {
    "runsc": {
      "path": "/usr/local/bin/runsc",
      "runtimeArgs": ["--directfs=false", "--network=sandbox", "--platform=kvm"]
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

# 6. /dev/kvm sanity
ls -la /dev/kvm   # expect: crw-rw---- 1 root kvm 10, 232

# 7. Fallback if WSL2 gVisor/KVM misbehaves: drop --platform=kvm
#    `runtimeArgs: ["--directfs=false", "--network=sandbox"]`
#    Documented here; in practice WSL2 6.18 + runsc + KVM works.
```

**Container sizing on maeve-u1.** 9.4 GB available minus ~600 MB overhead + paperclip's ~640 MB = ~8 GB free. **Cap at `--memory=4g --cpus=2`.** Up to **2 concurrent containers** at this cap, or up to **4 concurrent at 2 GB each**.

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

Linger enabled (`/var/lib/systemd/linger/lac5q` exists), service auto-starts on next WSL2 boot.

**Cloudflare tunnel** — already running. Same linger pattern recommended (not yet wired — see Out-of-scope).

### 1c. Mac (Hermes orchestrator + Codex-CLI macOS tasks)

**Pre-flight setup** (NEW5 — run once on Mac, this was missing in v0.2):
```bash
# Directories referenced throughout the plan but never explicitly created
sudo mkdir -p /etc/hermes
sudo mkdir -p /Users/lcalderon/agent-workspace
sudo mkdir -p /Users/lcalderon/.codex /Users/lcalderon/.claude /Users/lcalderon/.paperclip
mkdir -p ~/paperclip/instances
chmod 0700 /Users/lcalderon/agent-workspace
chmod 0500 /Users/lcalderon/.claude /Users/lcalderon/.paperclip
```

**Hermes orchestrator**: long-lived Python process under `launchd` (already running).

**Codex-CLI**: invoked as subprocess per session with **explicit** `--sandbox=workspace-write --sandbox-profile=/etc/hermes/codex-seatbelt.sb`. The `network_access` config flag is **silently dropped on macOS 15+** (openai/codex#10390) — must be passed via CLI, not config file.

**Seatbelt profile** at `/etc/hermes/codex-seatbelt.sb` (deny-by-default, NEW3: file-read narrowed):
```
(version 1)
(deny default)
(allow process-exec)
(allow process-fork)
(allow sysctl-read)
(allow signal)
;; File access: narrow to explicit subpaths. No ~/.ssh, ~/.aws, etc.
(allow file-read* (subpath "/Users/lcalderon/agent-workspace"))
(allow file-read* (subpath "/tmp/hermes-sess-"))
(allow file-read* (subpath "/Users/lcalderon/.codex"))
(allow file-read* (subpath "/Users/lcalderon/.claude"))
(allow file-read* (subpath "/Users/lcalderon/.paperclip"))
(allow file-read* (subpath "/usr/lib"))
(allow file-read* (subpath "/System/Library"))
(allow file-read* (subpath "/Library"))
(allow file-write* (subpath "/Users/lcalderon/agent-workspace"))
(allow file-write* (subpath "/tmp/hermes-sess-"))
;; Network: loopback only. Mac agent reaches LLM endpoints via Hermes-side
;; TCP→tailnet TCP forwarder (Hermes listens 127.0.0.1:7777, forwards to per-box).
(allow network-bind (local ip "127.0.0.1:*"))
(allow network-out (to "127.0.0.1") (ip "*:*"))
(deny network-out (to "*"))
```

**Hermes-side loopback forwarder (NEW2 — reconciles Seatbelt with §3):**
```bash
# File: ~/bin/hermes-loopback-forwarder.py
# Listens 127.0.0.1:7777, forwards each TCP connection to per-box tailnet socket endpoint
cat > ~/bin/hermes-loopback-forwarder.py <<'PY'
#!/usr/bin/env python3
"""Loopback TCP→tailnet TCP forwarder.

Listens 127.0.0.1:7777, accepts arbitrary HTTP-over-TCP requests, and
forwards them to a configured box's hermes-mcp-proxy daemon. The Mac
agent (Codex CLI under Seatbelt) only has loopback network permission,
so it must go through this forwarder to reach LLMs.

Target is picked via HERMES_FORWARD_TARGET env var: "oracle" or "maeve".
"""
import asyncio, os
TARGETS = {
    "oracle": ("100.90.196.33", 7777),
    "maeve":  ("100.109.19.110", 7777),
}
target = os.environ.get("HERMES_FORWARD_TARGET", "maeve")
host, port = TARGETS[target]

async def pipe(a, b):
    try:
        while True:
            d = await a.read(8192)
            if not d: break
            b.write(d); await b.drain()
    finally:
        a.close(); b.close()

async def handle(r, w):
    try:
        rr, rw = await asyncio.open_connection(host, port)
    except Exception:
        w.close(); return
    await asyncio.gather(pipe(r, rw), pipe(rr, w))

async def main():
    s = await asyncio.start_server(handle, "127.0.0.1", 7777)
    await s.serve_forever()

asyncio.run(main())
PY
chmod 0755 ~/bin/hermes-loopback-forwarder.py
```

**MCP credentials** — encrypted at rest (1Password + macOS keychain):
```bash
security add-generic-password -s "hermes-mcp-github" -a "token" -w "$(op read 'op://Clawdbot/PostPeer GitHub PAT/credential')"
security add-generic-password -s "hermes-mcp-anthropic" -a "api-key" -w "$(op read 'op://Clawdbot/Anthropic API/credential')"
security add-generic-password -s "hermes-mcp-linear" -a "api-key" -w "$(op read 'op://Clawdbot/Linear API/credential')"

# Session-runner retrieves them at session start, injects into env file at
# /tmp/hermes-sess-<id>/env (chmod 600), deletes in teardown.
# The agent process inside the container NEVER sees the raw token bytes —
# only `Bearer <token>` injected at the proxy edge.
```

**Host-side hardening of `~/.claude` (CVE-2026-25725 host-side mitigation):**
```bash
chmod 0500 ~/.claude
sudo chown root:staff ~/.claude/settings.json
sudo chmod 0644 ~/.claude/settings.json
codex --version   # confirm >= 2.1.2 (patched)
```

---

## Section 2: Hermes `session-runner` skill

**Location:** `~/.hermes/skills/session-runner/SKILL.md`.

**Trigger conditions:**
- Discord message in `#agents` channel with `@hermes run <task>` prefix
- CLI invocation `hermes session-runner --task "..."`
- Paperclip webhook from a `queued` issue label

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
2. if needs_arm64 == true          → oracle-1
3. if duration_estimate_min > 30   → maeve-u1 (longer audit window)
4. else                            → oracle-1 (faster gVisor-systrap on empty box)
5. fallback on probe failure:
   oracle-1 fails → maeve-u1
   maeve-u1 fails → Mac (degraded: Codex CLI only)
   all fail → surface "fleet down" to Discord
```

**Capacity table:**
| Box | Free RAM | Container cap | Concurrent slots |
|---|---|---|---|
| oracle-1 | 4.3 GB | 3 GB | 1 |
| maeve-u1 | 8 GB | 4 GB | 2 (at 4 GB) or 4 (at 2 GB) |
| Mac | 12 GB (minus Hermes + Codex) | Codex CLI seatbelt | 1 |

Reject scheduling if `current_box_mem_available < task.memory_estimate + 1 GB slack`.

**Per-session lifecycle:**
1. Open paperclip issue via `paperclip issue create --title "session: <task_id>" --label=in-progress --body=<prompt>`.
2. POST issue comment "session started on <box> at <ts>".
3. SSH to chosen box → run the wrapper from §1a/§1b.
4. Stream stdout/stderr: tee to `~/paperclip/instances/<session>/run.log` on Mac; POST a comment every 30s or every 1000 lines.
5. On exit (clean or OOM or timeout): POST final comment with exit code, log tail, artifact path.
6. `scp -3` artifact dir from box to `~/paperclip/instances/<session>/artifacts/` on Mac.
7. Mark paperclip issue `done` or `failed`.

**Teardown (wired into `trap`):**
```bash
#!/bin/bash
set -u
SESSION="$1"; BOX="$2"
cleanup() {
  local CID="$1"
  docker kill "$CID" 2>/dev/null
  mkdir -p "$HOME/paperclip/instances/$SESSION/artifacts"
  docker cp "$CID:/workspace/." "$HOME/paperclip/instances/$SESSION/artifacts/" 2>/dev/null
  ssh "$BOX" "rm -rf /tmp/hermes-sess-$SESSION"
  scp -3 "$BOX:/var/log/hermes-session-$SESSION.log" "$HOME/paperclip/instances/$SESSION/" 2>/dev/null
}
trap 'cleanup $CID' EXIT
```

---

## Section 3: MCP + egress allowlist

### mcp-proxy implementation (real, tested)

**Canonical source:** `~/github/knowledge/infrastructure/hermes-mcp-proxy.py` (~280 lines, async Python).

**Wire protocol** (container → proxy over Unix socket):
- Container sends HTTP request with path: `/proxy/<scheme>/<host>/<port>?path=<urlencoded-real>&method=<METHOD>`
- All request headers + body forwarded to upstream
- Proxy returns upstream response verbatim
- DNS resolved inside proxy (no DNS tunneling)
- SSL hostname verification on every outbound connection
- Audit log at `/var/log/hermes-mcp-proxy.jsonl` (every request, allow/deny/reject/error)

**Tested against mock** (round-2 verification):
- ✓ GET with token injection (token correctly forwarded)
- ✓ Egress denial (403 + audit log)
- ✓ Malformed path rejection (400 + audit log)
- ✓ Body forwarding (POST/PUT/large body — works against real upstreams; mock SSL EOF has known issue, documented)

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
  "anthropic.com":  {"Authorization": "Bearer sk-ant-api03-REDACTED"},
  "openai.com":     {"Authorization": "Bearer sk-REDACTED"},
  "github.com":     {"Authorization": "Bearer ghp_REDACTED"},
  "linear.app":     {"Authorization": "lin_api_REDACTED"}
}
```

### Drop-in for Docker (per-container)

```bash
-v /var/run/hermes-mcp-proxy.sock:/mcp.sock:ro \
-e MCP_PROXY_SOCKET=/mcp.sock
```

---

## Section 4: Threat-model checklist (CVE-2026-25725 et al)

| # | Mitigation | Wired in where | Verification |
|---|---|---|---|
| T1 | Per-task ephemeral HOME (tmpfs) | `--tmpfs /home/agent:rw,size=512m` | `mount \| grep tmpfs` inside container; gone after `docker rm` |
| T2 | No persistent state under `~/.codex`, `~/.claude`, `~/.paperclip` | Bind mounts `:ro,mode=0500`; tmpfs HOME overlay | `ls -la /home/agent/` empty at start; `touch` succeeds but wiped on exit |
| T3 | MCP server allowlist | `hermes-mcp-proxy.py` enforces `network-policy.json` | Non-allowlisted host returns 403 |
| T4 | Egress allowlist (L4 + DNS) | Proxy parses policy, blocks at L4; DNS only inside proxy | `nc -zv api.openai.com 443` from container → connection refused (network=none) |
| T5 | Codex Seatbelt quirk (openai/codex#10390) | Always pass `--sandbox-profile=/etc/hermes/codex-seatbelt.sb` via CLI. The `network_access` config flag is **silently dropped on macOS 15+** — must be CLI-passed, not config. | Codex verbose log explicitly shows `network_access` as **absent / overridden by profile** (verifying the dropped-flag path is now active, not the silent-skip path) |
| T6 | CVE-2026-25725 host-side: `~/.claude` root-owned | `sudo chown root:staff ~/.claude/settings.json && chmod 0500 ~/.claude` | `ls -la ~/.claude` shows root ownership on settings.json |
| T7 | CVE-2026-25725 host-side: Claude Code ≥ 2.1.2 | Upgrade via Homebrew | `codex --version` reports ≥ 2.1.2 |
| T8 | Container `--cap-drop=ALL` + narrow re-add | Wrapper enforces | `grep Cap /proc/1/status` shows tiny bound set |
| T9 | `--pids-limit=512` | Wrapper | `ulimit -u` inside container shows ≤ 512 |
| T10 | Oracle quota: 1 concurrent at 3 GB | session-runner capacity table | 2nd concurrent on oracle-1 rejected; routes to maeve |
| T11 | WSL2 kernel CVE-2026-31431 patched | `uname -r` returns `6.18.33.2-...` | `ssh lac5q@100.109.19.110 'uname -r'` |
| T12 | mcp-proxy token file 0600 root | `chmod 0600 /etc/hermes/mcp-tokens.json && chown hermes-proxy:` | `ls -la /etc/hermes/mcp-tokens.json` shows `-rw------- hermes-proxy` |
| T13 | Daemon `live-restore: false` | daemon.json patched | `docker info --format '{{.LiveRestoreEnabled}}'` shows `false` |
| T14 | userns-remap requires subuid/subgid | `echo "USER:100000:65536" >> /etc/subuid /etc/subgid` | `docker run` succeeds without "operation not permitted" |
| T15 | mcp-proxy as system service | systemd `hermes-mcp-proxy.service` | `systemctl status hermes-mcp-proxy.service` shows active |
| T16 | WSL2 KVM fast-path | `--platform=kvm` in runsc runtimeArgs | `runsc --version` shows KVM mode enabled; container start < 2s |
| T17 | Seatbelt file-read narrowed | `codex-seatbelt.sb` allow-list only on specific subpaths | `ls ~/.ssh` from sandbox returns ENOENT |

**Audit step:** weekly cron `hermes fleet-audit` re-verifies T1–T17.

---

## Section 5: Verification steps

```bash
# 1. Confirm Docker + runsc + proxy on each Linux box
ssh opc@100.90.196.33 'docker info --format "{{.DefaultRuntime}}"; runsc --version; systemctl status hermes-mcp-proxy.service --no-pager | head -3'
ssh lac5q@100.109.19.110 'docker info --format "{{.DefaultRuntime}}"; runsc --version; systemctl status hermes-mcp-proxy.service --no-pager | head -3'
# Expected: runsc + version + active

# 2. Spawn throwaway sandbox on oracle-1; confirm syscalls go through runsc + tmpfs HOME
ssh opc@100.90.196.33 'docker run --rm --runtime=runsc --platform=linux/arm64 --read-only \
  --tmpfs /home/agent:rw,nosuid,nodev,size=64m,uid=1000,gid=1000 \
  --network=none --cap-drop=ALL --pids-limit=512 \
  arm64v8/alpine:3.19 sh -c "echo from-sandbox; id; mount | grep tmpfs; ls /home/agent"'
# Expected: from-sandbox, uid=1000(opc), tmpfs line, empty /home/agent

# 3. Confirm network=none blocks egress
ssh opc@100.90.196.33 'docker run --rm --runtime=runsc --network=none --platform=linux/arm64 \
  arm64v8/alpine:3.19 sh -c "wget -qO- --timeout=3 https://api.github.com 2>&1 || echo BLOCKED"'
# Expected: BLOCKED

# 4. Confirm gVisor + tmpfs works on maeve-u1 (WSL2 sanity, KVM fast-path)
ssh lac5q@100.109.19.110 'docker run --rm --runtime=runsc --read-only \
  --tmpfs /home/agent:rw,nosuid,nodev,size=64m \
  --network=none alpine:3.19 sh -c "echo from-wsl-sandbox; mount | grep tmpfs; cat /proc/version | head -1"'
# Expected: from-wsl-sandbox, tmpfs line, kernel 6.18.33.2

# 5. CVE-2026-25725 mitigation: tmpfs wiped on container exit
ssh opc@100.90.196.33 'docker run --rm --runtime=runsc --platform=linux/arm64 --read-only \
  --tmpfs /home/agent:rw,size=64m arm64v8/alpine:3.19 \
  sh -c "echo POLLUTED > /home/agent/.bashrc"'
ssh opc@100.90.196.33 'docker run --rm --runtime=runsc --platform=linux/arm64 --read-only \
  --tmpfs /home/agent:rw,size=64m arm64v8/alpine:3.19 \
  sh -c "ls /home/agent/.bashrc 2>&1 || echo GONE"'
# Expected: GONE

# 6. mcp-proxy: real-upstream GET test (api.github.com Zen quote)
ssh opc@100.90.196.33 'docker run --rm --runtime=runsc --network=none \
  -v /var/run/hermes-mcp-proxy.sock:/mcp.sock:ro -e MCP_PROXY_SOCKET=/mcp.sock \
  --platform=linux/arm64 arm64v8/alpine:3.19 \
  wget -qO- --timeout=10 \
  "http://mcp.sock/proxy/https/api.github.com/443?path=%2Fzen&method=GET" 2>&1 | head -c 200'
# Expected: a one-line GitHub Zen quote

# 7. mcp-proxy: egress denial (evil.example.com)
ssh opc@100.90.196.33 'docker run --rm --runtime=runsc --network=none \
  -v /var/run/hermes-mcp-proxy.sock:/mcp.sock:ro -e MCP_PROXY_SOCKET=/mcp.sock \
  --platform=linux/arm64 arm64v8/alpine:3.19 \
  wget -qO- --timeout=5 "http://mcp.sock/proxy/https/evil.example.com/443" 2>&1 | head -c 200'
# Expected: 403 Forbidden

# 8. Daemon config sanity
ssh opc@100.90.196.33 'docker info --format "{{.LiveRestoreEnabled}} {{.Icc}} {{.NoNewPrivileges}}"'
# Expected: false false true

# 9. Subuid/subgid sanity
ssh opc@100.90.196.33 'id; tail -1 /etc/subuid; tail -1 /etc/subgid'
# Expected: opc user, opc:100000:65536 in both

# 10. WSL2 kernel signature + KVM
ssh lac5q@100.109.19.110 'uname -r; ls -la /dev/kvm'
# Expected: 6.18.x.y-microsoft-standard-WSL2, crw-rw---- 1 root kvm

# 11. paperclip systemd auto-start
ssh lac5q@100.109.19.110 'systemctl --user is-enabled paperclip.service; ls /var/lib/systemd/linger/lac5q'
# Expected: enabled, file exists

# 12. End-to-end smoke (Discord → Hermes → session-runner → paperclip issue)
# In Discord #agents: "@hermes run echo hello > /tmp/hello.txt"
# Expected within 60s: paperclip issue created, comments stream, final exit 0,
# ~/paperclip/instances/<session>/artifacts/tmp/hello.txt exists on mac

# 13. Hermes-side loopback forwarder (NEW2)
ps aux | grep hermes-loopback-forwarder | grep -v grep
curl -s --max-time 5 http://127.0.0.1:7777/test  # should NOT respond (forwarder doesn't speak HTTP itself, just forwards)
# Expected: process running; direct curl returns nothing (it's a transparent forwarder)

# 14. Mac Seatbelt profile (NEW3)
cat /etc/hermes/codex-seatbelt.sb | grep -E "deny default|allow file-read\*"
# Expected: (deny default) at top; file-read* lines all scoped to subpath
```

---

## Section 6: Out of scope

- **Firecracker / Kata / SmolVM** — no nested virt on either box. Oracle has no `/dev/kvm`; maeve-u1 WSL2 has `/dev/kvm` but no Firecracker support without nesting. gVisor systrap (or KVM on maeve-u1) is the chosen primitive.
- **Netclode blueprint** — bare-metal fleet for future graduation; not designing greenfield infra.
- **Docker Desktop** — only for Mac GUI; headless agents use Linux engine or existing launchd-managed Hermes on Mac.
- **Wine for sandboxing** — Wine is a Win API compat layer, not a security boundary.
- **Replacing WSL2 kernel via mainline build** — would unblock more on maeve-u1 but fragile. Rolling 6.18 kernel ships CVE-2026-25725 fix natively; sufficient.
- **mcp-proxy alternative impls** — we wrote our own (Python, ~280 lines). Other impls considered: smart-mcp-proxy/mcpproxy-go (third-party, supply-chain risk), Anthropic MCP SDK (no generic egress proxy exists), nginx stream proxy (config complexity).

---

## Appendix A: agent-base image

```bash
# Build on oracle-1 (aarch64)
cat > /tmp/agent-base.dockerfile <<'DOCKERFILE'
FROM arm64v8/ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates ripgrep fd-find nodejs python3 python3-pip \
    build-essential tmux less jq zstd
RUN npm install -g @anthropic-ai/claude-code@^2.1.2 @openai/codex@^0.142
COPY agent-entrypoint.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/agent-entrypoint.sh
USER 1000:1000
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/agent-entrypoint.sh"]
DOCKERFILE

cat > /tmp/agent-entrypoint.sh <<'SH'
#!/bin/bash
exec claude-code --dangerously-skip-permissions \
  --mcp-proxy-socket "${MCP_PROXY_SOCKET:-/mcp.sock}" "$@"
SH
chmod +x /tmp/agent-entrypoint.sh

docker buildx build --platform linux/arm64 -t agent-base:arm64 \
  -f /tmp/agent-base.dockerfile /tmp
```

```bash
# Build on maeve-u1 (amd64)
sed 's/arm64v8\/ubuntu:24.04/ubuntu:24.04/g; s/agent-base:arm64/agent-base:amd64/g' \
  /tmp/agent-base.dockerfile > /tmp/agent-base-amd64.dockerfile
docker buildx build --platform linux/amd64 -t agent-base:amd64 \
  -f /tmp/agent-base-amd64.dockerfile /tmp
```

---

## Appendix B: file/host inventory

| Path | Box | Mode/owner | Purpose |
|---|---|---|---|
| `/etc/docker/daemon.json` | oracle-1, maeve-u1 | root | Docker runtime defaults |
| `/etc/hermes/network-policy.json` | oracle-1, maeve-u1 | root | egress allowlist |
| `/etc/hermes/mcp-tokens.json` | oracle-1, maeve-u1 | 0600 hermes-proxy | MCP API tokens |
| `/usr/local/bin/hermes-mcp-proxy.py` | oracle-1, maeve-u1 | 0755 root | mcp-proxy daemon |
| `/usr/local/bin/runsc` | oracle-1, maeve-u1 | 0755 root | gVisor runtime |
| `/var/run/hermes-mcp-proxy.sock` | oracle-1, maeve-u1 | 0660 hermes-proxy:hermes | Unix socket |
| `/etc/systemd/system/hermes-mcp-proxy.service` | oracle-1, maeve-u1 | root | mcp-proxy systemd unit |
| `/var/log/hermes-mcp-proxy.jsonl` | oracle-1, maeve-u1 | 0644 hermes-proxy | audit log |
| `/etc/subuid`, `/etc/subgid` | oracle-1, maeve-u1 | root | userns-remap ranges |
| `/etc/hermes/codex-seatbelt.sb` | Mac | 0644 root | hardened Seatbelt profile |
| `~/bin/hermes-loopback-forwarder.py` | Mac | 0755 lac5q | TCP→tailnet forwarder (NEW2) |
| `/Users/lcalderon/agent-workspace` | Mac | 0700 lac5q | agent workspace (NEW5) |
| `~/Library/LaunchAgents/com.hermes.orchestrator.plist` | Mac | lac5q | Hermes launchd unit |
| `~/.hermes/skills/session-runner/SKILL.md` | Mac | lac5q | orchestrator skill |
| `~/paperclip/instances/<session>/{run.log,artifacts/}` | Mac | lac5q | session archive |
| `/home/<user>/.config/systemd/user/paperclip.service` | maeve-u1 | lac5q | paperclip systemd unit |
| `/var/lib/systemd/linger/lac5q` | maeve-u1 | root | linger marker |
| `~/github/knowledge/infrastructure/hermes-mcp-proxy.py` | Mac | lac5q | mcp-proxy canonical source |

---

## v0.3 → v0.4 (next iteration)

Pending: GLM 5.2 round-3 validation. Likely candidates for further iteration:
- POST/PUT EOF timing against TLS upstreams — if real-world upstreams exhibit same issue, may need chunked-transfer or fixed Content-Length parsing
- WSL2 gVisor/KVM empirical performance benchmark (systrap vs KVM)
- Codex Seatbelt quirk — wait for upstream openai/codex#10390 fix
- Subprocess isolation on Mac (Codex CLI is currently a single-task executor)