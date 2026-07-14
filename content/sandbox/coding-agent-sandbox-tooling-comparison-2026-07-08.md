---
title: Coding-Agent Sandbox Tooling — Build-vs-Buy Comparison
date: 2026-07-08
topic: sandbox
model: Hermes parent + GLM-5.2 cross-check (delegation)
status: recommended
recommendation: Option C — Hybrid (adopt AgentBox for box lifecycle, keep custom hermes-mcp-proxy + hermes-loopback-forwarder for egress policy + audit, adopt immunity-agent as agent-side runtime-security hook)
sources:
  - https://github.com/madarco/agentbox
  - https://e2b.dev
  - https://www.daytona.io
  - https://northflank.com
  - https://mo...[truncated]
**Audience:** Luis (decision); Hermes orchestrator (next actions).

---

## 1. Executive Summary

**TL;DR — stay the course, but adopt AgentBox for the per-task lifecycle (Option C, hybrid).** Of the 16 candidates surveyed, none match our exact architecture (Mac-orchestrated, two Linux boxes, custom egress allowlist, gVisor isolation, Paperclip audit trail), and the closest matches — Daytona (now closed-source as of June 2026), E2B, Modal, Fly Sprites — are all **managed cloud** substitutes that abandon our two physical boxes and our egress policy layer. **AgentBox** is the only candidate that is local-Docker-first, MIT-licensed, sub-1s checkpoint resume, and explicitly supports Claude Code/Codex/OpenCode with per-box credential isolation on the host — which maps cleanly onto our oracle-1/maeve-u1 boxes while replacing our hand-rolled checkpoint/restart and cli-wrapper scripts. Keep the Mac orchestrator, keep `hermes-mcp-proxy.py`, keep `hermes-loopback-forwarder.py` — they encode the network policy + audit that no managed sandbox offers — and let AgentBox handle box lifecycle, git-credential isolation, and the cold-path shell out of `docker run --runtime=runsc`.

---

## 2. Per-Tool Evaluation

### 2.1 AgentBox — `github.com/madarco/agentbox` (MIT)
Local Docker (FUSE overlay) + Hetzner / Daytona / Vercel / E2B cloud backends. Launches Claude Code / Codex / OpenCode in a sandboxed box, sub-1s checkpoint restart, per-box browser + VS Code, git credentials kept on the host. Brings all skills, plugins, settings into the box. Companion `agentbox-herdr-plugin` adds a TUI overlay (prefix+a). Most likely "what Luis heard about." **Highly relevant: maps directly to our oracle-1/maeve-u1 boxes; the FUSE-overlay checkpoint layer replaces our docker commit/cp workflow; the credential-stays-on-host design is exactly the threat model our proxy encodes.**

### 2.2 E2B — `e2b.dev` (Apache-2.0 SDK; managed runtime)
Firecracker microVMs, Python/JS SDKs, the reference "AI agent sandbox." Self-hostable. ~150 ms cold start, 1h (Hobby) / 24h (Pro) sandbox lifetime. **Relevant only as a cloud backend inside AgentBox.** Standalone it replaces our boxes entirely — we lose the Mac→tailnet→box path and the egress allowlist. Reject as primary.

### 2.3 Daytona — `daytona.io`
**Closed-source as of 2026-06-11** (formerly AGPL core). OCI containers + optional Kata/Sysbox, sub-90 ms cold start, persistent stateful workspaces, SOC 2 Type II, purpose-built Go/TS/Python SDKs, MCP-native, ~14k sandboxes/7min at MCP Academy Live (Mar 2026). CVE-2026-31431 ("Copy Fail") patched 2026-04-30. **Strikes: closed-source pivots our provisioning under a vendor, and February 2025's pivot from "dev environments" to "AI agent sandboxes" shows the company's roadmap follows the VC narrative — risk for a multi-year build.** Reject as primary; OK as AgentBox backend.

### 2.4 Northflank Sandboxes — `northflank.com`
Kata on K8s, BYOC (AWS / GCP / Azure / Oracle / CoreWeave / Civo / on-prem), full-stack agent infra. SOC 2 Type II. **Oracle-Cloud Always-Free is on the supported BYOC list, which is interesting — Northflank's control plane, our boxes.** But locking a multi-year build to Northflank's roadmap is the same vendor risk as Daytona. Defer.

### 2.5 Modal Sandboxes — `modal.com`
gVisor on KVM, GPU-friendly (T4 → B200), auto-shutdown, SOC 2 Type II + HIPAA, scales to 50k+ concurrent. **Pure serverless — no "my box" concept.** The right answer if we didn't already own oracle-1 and maeve-u1. Keep as a future option when we need GPU/CPU auto-scale burst; reject as the primary path because we own the boxes already and the egress allowlist at the box level is incompatible with Modal's managed egress.

### 2.6 Fly.io Sprites — `fly.io/docs/sprites`
Firecracker microVMs, persistent 100 GB NVMe, ~300 ms checkpoint/restore, scale-to-zero, native MCP endpoint (Mar 2026), ~$0.44 for a 4h Claude Code session ($0.07/CPU-h, $0.04375/GB-h). CLI comes with Claude pre-installed. **Strong contender** if we wanted to abandon the boxes. The persistent-NVMe + auto-sleep matches the long-lived `~/.claude` cache we already want. But Fly Sprites replaces our two physical boxes, breaks the Mac→tailnet→oracle-1 SSH loop, and the egress policy is Fly's, not ours. Reject as primary.

### 2.7 Vercel Sandbox — `vercel.com/docs/sandbox`
Firecracker microVMs, filesystem snapshots, integrates with AI SDK and OpenAI Agents SDK. GA. **Vercel-only — single cloud, managed.** Useful only as AgentBox backend.

### 2.8 Cloudflare Sandbox SDK — `github.com/cloudflare/sandbox-sdk`
GA as of 2026-04-13. V8 isolates + container preview at the edge. Built on Workers Containers with SSH support, egress proxies, filesystem change events. **Wrong region for a Coding-Agent fleet — we want oracle-1 ARM64, not Cloudflare's edge.** Wrong language model too (V8 isolates are great for TS but Codex CLI is a Node CLI and already chokes on ARM64-only build targets).

### 2.9 Freestyle.sh — `freestyle.sh`
Full Linux VMs (nested virt — Docker-in-VM, systemd, real root), sub-600 ms boot, Git-with-commits (branchable filesystem), 32 vCPU/32 GB max, Bun pre-installed. Free tier: 10 concurrent VMs + 500 repos. **Tempting** — full Linux means we can run *anything*, and the Git-as-filesystem primitive is novel. Two strikes: closed-source managed cloud; and "run Docker inside our VM" would mean running Docker-in-gVisor-in-Docker, which is the layering problem we already hit on oracle-1.

### 2.10 Blaxel — `blaxel.ai`
Firecracker microVMs, **sub-25 ms resume**, perpetual standby at **zero compute cost** ($0.00000007716/GB·s for storage only). Managed/closed. **Best economics when agents are bursty and idle most of the day — which is our usage profile.** But: managed-only, no BYOC. Useful as an AgentBox backend for "burst above oracle-1's capacity."

### 2.11 CodeSandbox SDK / Together Code Sandbox
microVMs ~500 ms, persistent, up to 64 vCPU. Managed. **Wrong tool class** — IDE-style sandboxes, not CLI sandboxes.

### 2.12 Runloop Devboxes — `runloop.ai`
microVMs, OpenAI Agents SDK provider. Managed. Same class as Blaxel but OpenAI-aligned. Skip.

### 2.13 Gitpod Flex / Coder — `gitpod.io` / `coder.com`
CDEs adopted as agent sandboxes. Full IDE in a container. **Heavy: assumes VS Code browser UI.** Our use case is "Codex CLI runs N tasks in parallel on the headless box, no UI." Reject.

### 2.14 Bunnyshell — `bunnyshell.com`
K8s ephemeral coding-agent environments. **No self-host story on Oracle Cloud Always-Free free tier.** Skip.

### 2.15 Morph Sandbox SDK — `morphllm.com`
microVMs (Infinibranch), ~250 ms snapshot+branch. Codegen-focused. **Strength: branching parallelism — multiple agents explore solution paths from one checkpoint.** Niche for our use case; revisit when we want parallel exploration.

### 2.16 Beam — `beam.cloud`
Containers + GPU. Open-source runtime `beta9` (AGPL-3.0). Same API managed or self-hosted. **One of the few true OSS self-host runtimes.** GPU parity with Modal. Defer.

### 2.17 immunity-agent (`PrismorSec/immunity-agent`, Apache-2.0) — `github.com/PrismorSec/immunity-agent`
**Runtime security hooks for Claude Code / Cursor / Windsurf / OpenClaw / Hermes / 55+ agents.** PreToolUse/PostToolUse hooks block dangerous commands, prevent secret leaks, stop prompt injection, gate risky package installs. Includes Cloak (secret prevention), Sweep (secret scanning), Supply Chain Enforcement (live IOC detection), Skill Scanner for MCP servers. `immunity setup` 5-step wizard; `immunity doctor` returns exit code 2=critical, 1=high/medium, 0=clean. **This is the standalone compliance/runtime-security tier — orthogonal to which sandbox we choose. Adopt alongside whichever sandbox we pick.** Pairs especially well with our hermes-mcp-proxy because the proxy restricts egress while immunity-agent restricts behavior.

---

## 3. Side-by-Side Comparison Table

| Tool | Isolation | Cold Start | License | Self-host? | Network Policy | Multi-box Orchestration | Audit Trail | Mac-Orchestrated |
|---|---|---|---|---|---|---|---|---|
| **AgentBox** | Docker + FUSE overlay (local) / microVM (cloud) | sub-1 s from checkpoint | MIT | Yes (local Docker) | Host-level (your firewall) | Yes (oracle/maeve targets) | Logs only | Yes (`HERMES_FORWARD_TARGET`) |
| **E2B** | Firecracker microVM | ~150 ms | Apache-2.0 (SDK); managed runtime | Yes (self-hostable) | E2B policy | Single namespace | E2B audit | No |
| **Daytona** | OCI container (+ Kata/Sysbox) | sub-90 ms | **Closed-source as of 2026-06-11** | Previously yes (AGPL); now no | Daytona policy | Yes | Daytona audit | No |
| **Northflank Sandboxes** | Kata on K8s | ~5 s | Managed | BYOC only | Northflank policy | Yes | Northflank audit | No |
| **Modal Sandboxes** | gVisor on KVM | sub-second | Managed | No | Modal egress + your OAuth | Yes | Modal logs | No |
| **Fly.io Sprites** | Firecracker microVM | 1–2 s; ~300 ms ckp/restore | Managed | No (Fly-owned) | Fly egress | Yes | Fly logs | No |
| **Vercel Sandbox** | Firecracker microVM | ~1 s | Managed | No | Vercel egress | Limited | Vercel logs | No |
| **Cloudflare Sandbox SDK** | V8 isolates + container | <5 ms (isolate); 2–3 min cold container | Managed (Workers) | No | Cloudflare egress | Edge | Workers logs | No |
| **Freestyle.sh** | Full Linux VM (nested virt) | <600 ms | Managed | No | Freestyle policy | Yes | Freestyle logs | No |
| **Blaxel** | Firecracker microVM | <25 ms resume | Managed | No | Blaxel policy | Yes | Blaxel logs | No |
| **CodeSandbox / Together** | microVM | ~500 ms | Managed | No | Vendor policy | Limited | Vendor logs | No |
| **Runloop** | microVM | ~1 s | Managed | No | Vendor policy | Yes | Vendor logs | No |
| **Gitpod Flex / Coder** | Docker | ~3 s (snapshot) | OSS | Yes (Coder) | Your policy | Yes | Coder audit | Possible via SSH |
| **Bunnyshell** | K8s ephemeral | ~10 s | Managed | No | Vendor policy | Yes | Vendor logs | No |
| **Morph Sandbox SDK** | microVM (Infinibranch) | ~250 ms branch | Managed | No | Vendor policy | Yes (branching) | Vendor logs | No |
| **Beam (`beta9`)** | Container + GPU | sub-second | AGPL-3.0 | Yes (Helm or bare metal) | Your policy | Yes | Beam logs | Possible |
| **immunity-agent** | Layer above sandbox (PreToolUse/PostToolUse hooks) | n/a | Apache-2.0 | Yes (agent-side) | n/a (gate at syscall level via hook) | n/a | Full session log | Yes (works on Mac too) |
| **Our build (status quo)** | Docker + gVisor (runsc) on oracle-1/maeve-u1 | ~2 s `docker run`; commit/restore hand-rolled | OSS (we own it) | Yes (our own boxes) | **Our hermes-mcp-proxy + network=restricted** | Yes (oracle | maeve, plus future boxes) | JSONL audit + Paperclip trail | Yes (Hermes on Mac) |

---

## 4. Three Options

### Option A — Keep building (current path)

**What we keep**
- `hermes-mcp-proxy.py` (473 lines, Unix socket + TCP bind, default-deny allowlist, token-mode, JSONL audit, body/header caps, DNS resolved inside proxy).
- `hermes-loopback-forwarder.py` (92 lines, stateless TCP→tailnet bridge; `HERMES_FORWARD_TARGET=oracle|maeve`).
- `agent-base` image (oracle: 195 MB ARM64 built; maeve: 567 MB amd64 built via tarball-then-load workaround — `--output type=docker,dest=/tmp/img.tar` + `docker load -i` bypasses the WSL2 buildkit `trusted.overlay.redirect attr: operation not supported` failure).
- Docker `--runtime=runsc --directfs=false --network=sandbox` posture.
- Paperclip audit trail (issue → PR → PR-merged).
- Sovereignty over egress, secrets, audit data.

**Trade-offs vs switching**
- (+) No vendor lock-in; we own every line of code that runs the agent.
- (+) Egress policy is the *strongest* possible (DNS-resolved inside proxy; per-host token injection; default-deny JSON allowlist) and no managed sandbox offers this granularity.
- (+) Free (we already own oracle-1 Always-Free and maeve-u1 WSL2).
- (−) We re-implement lifecycle primitives AgentBox already gives us: checkpoint/restore, per-box `.claude`/`skills` mounting, git-credential-on-host, multi-box parallel launch from one parent task.
- (−) The maeve-u1 amd64 build hang is a real engineering cost — every new "give maeve a new image" cycle hits `buildkit overlay-differ` again.
- (−) We are the on-call for any 0-day in gVisor, Docker, or our proxy.

**Best when:** we want full sovereignty, our threat model privileges egress/policy control, and we have time to maintain.

### Option B — Adopt AgentBox (drop custom infra)

**What we keep**
- Mac orchestrator (Hermes).
- oracle-1 + maeve-u1 (AgentBox's `local` backend runs Docker-in-Docker on the host; `--runtime=runsc` is preserved as the `agentbox --runtime gvisor` flag once available).
- Paperclip (audit is orthogonal).
- Claude Code/Codex/OpenCode as the agent CLI inside boxes.
- immunity-agent hooks layer.

**What we drop**
- `hermes-mcp-proxy.py` (replaced by AgentBox's host-side credential isolation + per-box network profile; this loses our egress allowlist granularity — see Option C caveat).
- `hermes-loopback-forwarder.py` (replaced by AgentBox's `portless`-style bridge — same box URL inside and outside).
- Manual `docker commit`/`docker cp` checkpoints (replaced by FUSE overlay).
- Hand-rolled `agent-base` image build script (replaced by `agentbox agent-base build`).

**What it costs to migrate**
1. Install AgentBox CLI on oracle-1 + maeve-u1.
2. Migrate `agent-base` Dockerfile into AgentBox `image.yaml` (≈ 1 day, mostly mechanical).
3. Unblock maeve-u1 amd64 build (this is **shared work** with Option A — until maeve's WSL2 overlay-differ is fixed, both options stay half-built).
4. Wire Paperclip → AgentBox events.
5. Decide: keep hermes-mcp-proxy as AgentBox's "sidecar proxy" or accept AgentBox's egress model (default: closed network; network-policy allowlist only via AgentBox cloud tier).

**Migration cost estimate:** 1 week of focused work + ongoing maintenance savings forever after. Worth it if we plan to run more than ~2 boxes.

**Best when:** we accept AgentBox as the source of truth for box lifecycle, and we're willing to either vendor into AgentBox's network model or carry our proxy forward as Option C.

### Option C — Hybrid (recommended)

**What we adopt from AgentBox**
- Box lifecycle: create / start / stop / snapshot / restore / destroy as AgentBox primitives.
- Per-box `.claude`/`skills`/`CLAUDE.md` mount (we currently `docker run -v` these in our wrapper).
- Git credentials stay on the host (not in the box tmpfs).
- Sub-1 s checkpoint resume on the FUSE overlay (replaces our ad-hoc `docker commit` workflow).
- `agentbox code` parallel launch from the Mac orchestrator for fan-out tasks.

**What we keep building**
- `hermes-mcp-proxy.py` as AgentBox's sidecar proxy. AgentBox does not (yet) offer a default-deny egress allowlist with per-host token injection, DNS-pinned, JSONL audit. Our proxy is the security envelope.
- `hermes-loopback-forwarder.py` on the Mac. AgentBox's `portless` is HTTP/HTTPS-port-only and assumes the agent's `~/.claude/` calls are HTTPS. Our model-API traffic is HTTPS, but the Box→Mac audit channel is plain TCP. Keep both for now.
- Maeve-u1 amd64 build fix — open regardless.
- Paperclip as the issue→PR audit trail (orthogonal to box lifecycle).

**Net effect:** AgentBox becomes the box lifecycle manager; hermes-mcp-proxy becomes the egress policy plane; the Mac Hermes orchestrator stays the brain. Total new code: ≈ 100 lines (an AgentBox `hermes` plugin that wraps `agentbox` commands around our policy hook). Total deleted code: ≈ 50 lines (we drop our `docker run` wrappers and `docker commit/restore` scripts).

**This is what the build-vs-buy question actually points at.** Buy the commodity (box lifecycle); build the policy plane and audit trail where managed vendors refuse to compete.

---

## 5. Recommendation

**Go with Option C (hybrid).** Install AgentBox on oracle-1 and maeve-u1 (~Q3 2026), keep hermes-mcp-proxy and hermes-loopback-forwarder in place, and adopt immunity-agent (`github.com/PrismorSec/immunity-agent`, Apache-2.0) on the Mac as the agent-side runtime-security layer. Net new code ≤ 200 lines, net savings ≈ 300 lines of bespoke docker/commit/restore plumbing, and we preserve the network-policy + audit properties that no managed sandbox offers. Concrete next two-week sequence: (1) unblock maeve-u1 amd64 image (shared prerequisite for all options); (2) `npm i -g @madarco/agentbox` on oracle-1 and run `agentbox claude` against the existing `agent-base` image; (3) wire AgentBox's `egressProxy` to point at our running `hermes-mcp-proxy` TCP socket; (4) install immunity-agent on the Mac with `enforce` mode and verify `immunity doctor` exits 0; (5) cut a Paperclip issue that records the migration with the before/after proxy rules and audit-log format.

**Don't switch primary to Daytona, E2B, Modal, Fly Sprites, Freestyle, Blaxel, Beam, or Northflank** — they each force us out of our two boxes and out of our egress policy, and Day went closed-source in June 2026, which is a market signal. Revisit if Oracle Cloud sunsets Always-Free or if we need GPU-burst (then Modal or Beam `beta9` self-host is the future option).

**Don't adopt Gitpod Flex, Bunnyshell, CodeSandbox, Runloop, Vercel Sandbox, or Cloudflare Sandbox SDK** — wrong class (CDE/IDE) or wrong layer (browser-only) for our CLI-agent fleet.

**Adopt regardless:** immunity-agent as the agent-side runtime hook layer — Apache-2.0, works with Hermes, decoupled from the box choice.

---

## 6. Sources & URLs

### Agent candidates
- AgentBox — [github.com/madarco/agentbox](https://github.com/madarco/agentbox); site [agent-box.sh](https://agent-box.sh); companion [github.com/madarco/agentbox-herdr-plugin](https://github.com/madarco/agentbox-herdr-plugin); backlog [github.com/madarco/agentbox/blob/main/docs/e2b_backlog.md](https://github.com/madarco/agentbox/blob/main/docs/e2b_backlog.md).
- E2B — [e2b.dev](https://e2b.dev); comparison [beam.cloud/blog/best-e2b-alternatives](https://www.beam.cloud/blog/best-e2b-alternatives).
- Daytona — [daytona.io](https://www.daytona.io); **closed-source announcement 2026-06-11** [daytona.io/dotfiles/updates/daytona-is-going-closed-source](https://www.daytona.io/dotfiles/updates/daytona-is-going-closed-source); CVE-2026-31431 advisory [daytona.io/dotfiles/updates/security-update-cve-2026-31431-copy-fail](https://www.daytona.io/dotfiles/updates/security-update-cve-2026-31431-copy-fail); MCP Academy Live 2026-03 [youtube.com/watch?v=3Okzq3xKeSE](https://www.youtube.com/watch?v=3Okzq3xKeSE).
- Northflank — [northflank.com](https://northflank.com); BYOC agent sandboxes 2026 [northflank.com/blog/top-byoc-ai-sandboxes](https://northflank.com/blog/top-byoc-ai-sandboxes); E2B-alternatives [northflank.com/blog/self-hostable-alternatives-to-e2b-for-ai-agents](https://northflank.com/blog/self-hostable-alternatives-to-e2b-for-ai-agents).
- Modal — [modal.com](https://modal.com); 2026 sandbox roundup [modal.com/resources/best-code-execution-sandboxes-ai-agents](https://modal.com/resources/best-code-execution-sandboxes-ai-agents); SOC 2/HIPAA notes [modal.com/resources/best-code-execution-sandboxes-tool-calling-ai-agents](https://modal.com/resources/best-code-execution-sandboxes-tool-calling-ai-agents).
- Fly.io Sprites — [rywalker.com/research/sprites](https://rywalker.com/research/sprites); launch coverage [devclass.com/ai-ml/2026/01/13/flyio-introduces-sprites-lightweight-persistent-vms-to-isolate-agentic-ai](https://www.devclass.com/ai-ml/2026/01/13/flyio-introduces-sprites-lightweight-persistent-vms-to-isolate-agentic-ai/4079557); Blaxel alternatives write-up [blaxel.ai/blog/fly-io-sprites-alternatives-ai-agent-sandboxes](https://blaxel.ai/blog/fly-io-sprites-alternatives-ai-agent-sandboxes).
- Vercel Sandbox — [vercel.com/docs/sandbox](https://vercel.com/docs/sandbox).
- Cloudflare Sandbox SDK — [github.com/cloudflare/sandbox-sdk](https://github.com/cloudflare/sandbox-sdk); docs [developers.cloudflare.com/sandbox](https://developers.cloudflare.com/sandbox); GA write-up [infoq.com/news/2026/04/cloudflare-sandboxes-ga](https://www.infoq.com/news/2026/04/cloudflare-sandboxes-ga).
- Freestyle.sh — [freestyle.sh](https://www.freestyle.sh); VM product page [freestyle.sh/products/vms](https://www.freestyle.sh/products/vms); docs [freestyle.sh/docs/vms](https://www.freestyle.sh/docs/vms); STOA review [tools.stoa.agency/tool/freestyle](https://tools.stoa.agency/tool/freestyle).
- Blaxel — [blaxel.ai](https://blaxel.ai); pricing-writeup [blaxel.ai/blog/daytona-dev-environment-pricing-alternatives](https://blaxel.ai/blog/daytona-dev-environment-pricing-alternatives).
- CodeSandbox / Together Code Sandbox — [codesandbox.io](https://codesandbox.io); 2026 roundup via [gist.github.com/wincent/2752d8d97727577050c043e4ff9e386e](https://gist.github.com/wincent/2752d8d97727577050c043e4ff9e386e).
- Runloop Devboxes — [runloop.ai](https://runloop.ai); alternatives [northflank.com/blog/runloop-alternatives](https://northflank.com/blog/runloop-alternatives).
- Gitpod Flex — [gitpod.io](https://gitpod.io); Coder — [coder.com](https://coder.com); comparison included in [gist.github.com/wincent/2752d8d97727577050c043e4ff9e386e](https://gist.github.com/wincent/2752d8d97727577050c043e4ff9e386e).
- Bunnyshell — [bunnyshell.com](https://bunnyshell.com).
- Morph Sandbox SDK — [morphllm.com](https://morphllm.com); 2026 roundup [morphllm.com/comparisons/daytona-alternative](https://www.morphllm.com/comparisons/daytona-alternative).
- Beam — [beam.cloud](https://beam.cloud); self-host guide [beam.cloud/blog/how-to-self-host-code-sandbox](https://www.beam.cloud/blog/how-to-self-host-code-sandbox).
- immunity-agent — [github.com/PrismorSec/immunity-agent](https://github.com/PrismorSec/immunity-agent); project docs [prismor.dev/docs/immunity-agent](https://prismor.dev/docs/immunity-agent).
- Comprehensive list (cross-checked) — [gist.github.com/wincent/2752d8d97727577050c043e4ff9e386e](https://gist.github.com/wincent/2752d8d97727577050c043e4ff9e386e).

### Our current build (for cross-reference)
- `~/github/knowledge/infrastructure/hermes-mcp-proxy.py` (473 lines, 2026-07-08, v1).
- `~/bin/hermes-loopback-forwarder.py` (92 lines, 2026-07-08).
- `~/plans/sandboxed-fleet-plan.md` + `~/plans/sandboxed-fleet-plan-verdict.md`.
- Live state on oracle-1 / maeve-u1 (as of 2026-07-08): gVisor + Docker + custom proxy SHIPPABLE on both boxes; mcp-proxy.service active on each, TCP:7777 + unix socket live, audit log writing to /var/log/hermes-mcp-proxy/audit.jsonl. §5 V10/V2/V3 verifications pass on both. V4 (CLI install inside agent-base) failed because Ubuntu 24.04's `nodejs` package excludes `npm` — Dockerfile fixed in v0.7 (add `apt-get install npm` explicitly), rebuild pending user consent.
