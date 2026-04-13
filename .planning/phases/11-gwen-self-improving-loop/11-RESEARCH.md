# Phase 11: Gwen Self-Improving Loop — Research

**Researched:** 2026-04-12
**Domain:** OpenClaw agent configuration, skill-sync pipeline, cron scheduling
**Confidence:** HIGH — all findings verified by direct filesystem inspection

---

## Summary

Phase 11 implements Gwen's self-improving loop across three requirements: AGENT-01 (skill installed + mem0-only memory), AGENT-02 (new skills staged to `.hermes-staging/` for Hermes pickup), and AGENT-03 (reflection cron at 3am to avoid Hermes 4am collision).

The good news: AGENT-01 is substantially done. The `self-improving-agent` skill is already installed at `~/.openclaw/skills/self-improving-agent/`, the `.learnings/` directory exists in `~/.openclaw/workspace-gwen/`, and Gwen's AGENTS.md already documents the mem0-only constraint and `.hermes-staging/` path. What remains is verification and cron registration.

The critical finding: AGENT-02 has a broken pickup mechanism. The `.hermes-staging/` directory exists and Gwen is told to write there, but `skill-sync.py` never reads from it. The CONFIG dict in the script has no staging source. Phase 11 must add a new sync direction: `.hermes-staging/` → master. This is the primary implementation work.

AGENT-03 has no cron registered anywhere. Hermes's `skill-sync.json` runs at `0 4 * * *` with no explicit timezone (defaults to system local). The Gwen reflection cron must be registered at 3am with `tz: 'America/Los_Angeles'` to guarantee no collision regardless of system timezone.

**Primary recommendation:** The planner must treat this as three distinct tasks: (1) verify AGENT-01 is clean, (2) add staging pickup to skill-sync.py, (3) create the Hermes cron JSON file for Gwen reflection.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGENT-01 | Gwen's `self-improving-agent` skill installed with mem0-only memory (Cognee-OpenClaw explicitly NOT installed) | Skill verified at `~/.openclaw/skills/self-improving-agent/`. `.learnings/` directory exists. Cognee confirmed absent from plugins and extensions. mem0 running on port 3201 confirmed. |
| AGENT-02 | Skills Gwen creates during sessions are staged to `.hermes-staging/` for Hermes pickup | Directory exists at `~/github/knowledge/skills/.hermes-staging/.gitkeep`. AGENTS.md tells Gwen to write there. Gap: `skill-sync.py` has no staging pickup logic — code change required. |
| AGENT-03 | Gwen reflection cron runs at 3am (avoids 4am collision with Hermes sync cron) | No reflection cron exists anywhere. Hermes skill-sync runs at `0 4 * * *` (no tz — system default). Cron must be added as a Hermes cron JSON file with explicit `tz: 'America/Los_Angeles'`. |
</phase_requirements>

---

## Current State of Gwen's OpenClaw Config

**Workspace path:** `~/.openclaw/workspace-gwen/`
**Config files found:**
- `AGENTS.md` — Gwen's workspace instructions. Already contains:
  - Self-Improving skill reference with `.learnings/` directory
  - Memory constraint: `POST http://localhost:3201/memory/add` with `agent_id: "gwen"`, "Never enable Cognee-OpenClaw"
  - Skills constraint: write to `~/github/knowledge/skills/.hermes-staging/<skill-name>/`, NOT `~/skills/` or `~/.openclaw/skills/` directly
  - Reflection cron noted as "Scheduled at 3:00 AM"
- `SOUL.md`, `USER.md`, `HEARTBEAT.md`, `MEMORY.md`, `TOOLS.md` — standard workspace files present
- `BOOTSTRAP.md` — present (standard onboarding)
- `.learnings/` — exists with `ERRORS.md`, `FEATURE_REQUESTS.md`, `LEARNINGS.md` [VERIFIED: filesystem]

**What AGENTS.md documents vs. what is actually implemented:**
- AGENTS.md says "Skill is installed" → TRUE (confirmed at `~/.openclaw/skills/self-improving-agent/`) [VERIFIED]
- AGENTS.md says "Reflection Cron / Scheduled at 3:00 AM" → NOT YET (no cron registered) [VERIFIED]
- AGENTS.md says staging path is `.hermes-staging/` → documented but no pickup code exists [VERIFIED]

---

## AGENT-01: Self-Improving-Agent Skill Install

### Current State

**Skill location:** `~/.openclaw/skills/self-improving-agent/` [VERIFIED: filesystem]

**Skill files present:**
```
~/.openclaw/skills/self-improving-agent/
├── SKILL.md
├── LEARNINGS.md
├── ERRORS.md
├── FEATURE_REQUESTS.md
├── assets/
├── hooks/
├── references/
└── scripts/
```

**Installation method (for reference):** [VERIFIED: clawdhub --help]
```bash
/opt/homebrew/bin/clawdhub install self-improving-agent
```
The binary is at `/opt/homebrew/bin/clawdhub` (not in PATH for normal shells). This is already done — no reinstall needed.

**Alternative if needed (manual clone):**
```bash
git clone https://github.com/peterskoett/self-improving-agent.git ~/.openclaw/skills/self-improving-agent
```

### Cognee-OpenClaw Status

**Cognee confirmed ABSENT** [VERIFIED: filesystem]
- `~/.openclaw/plugins/` — no cognee entry (4 plugins present: dingtalk, feishu-openclaw-plugin, openclaw-weixin, wecom)
- `~/.openclaw/extensions/` — no cognee entry (4 entries present, none cognee)

No action needed to "block" Cognee — it was never installed.

### mem0 Memory Configuration

**mem0 service status:** Running [VERIFIED: `curl -s http://localhost:3201/health` returns `{"status":"ok","vector_store":"connected",...}`]

**Correct write endpoint:**
```bash
POST http://localhost:3201/memory/add
{
  "agent_id": "gwen",
  "messages": [{"role": "user", "content": "..."}]
}
```

**Architecture constraint (NEVER violate):**
- Write to mem0 only via the HTTP endpoint above
- Never write to Qdrant `agent_memory` collection directly
- The Qdrant `agent_memory` collection is owned by mem0 — do not touch it

### Verification for AGENT-01

```bash
# 1. Skill installed
ls ~/.openclaw/skills/self-improving-agent/SKILL.md

# 2. .learnings directory exists
ls ~/.openclaw/workspace-gwen/.learnings/

# 3. Cognee absent
ls ~/.openclaw/plugins/ | grep -i cognee && echo "FAIL: Cognee present" || echo "PASS: No Cognee"
ls ~/.openclaw/extensions/ | grep -i cognee && echo "FAIL: Cognee present" || echo "PASS: No Cognee"

# 4. mem0 endpoint healthy
curl -s http://localhost:3201/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS' if d['status']=='ok' else 'FAIL')"

# 5. AGENTS.md has mem0 constraint
grep -q "localhost:3201" ~/.openclaw/workspace-gwen/AGENTS.md && echo "PASS: mem0 constraint documented" || echo "FAIL: mem0 constraint missing"
```

---

## AGENT-02: Skill Staging Pickup

### The Gap (Critical Finding)

`skill-sync.py` CONFIG dict [VERIFIED: read full 352-line script]:
```python
CONFIG = {
    "master_dir": Path.home() / "github" / "knowledge" / "skills",
    "openclaw_dir": Path.home() / ".openclaw" / "skills",
    "hermes_dir": Path.home() / ".hermes" / "hermes-agent" / "optional-skills",
    "clawhub_dir": Path.home() / "skills",
    ...
}
```

**No staging_dir entry.** The script syncs:
- master → OpenClaw
- master → Hermes
- Hermes → master (contributions)

**Missing:** `.hermes-staging/` → master direction.

### What Must Be Added to skill-sync.py

A new sync direction picking up skills Gwen (or any agent) drops into `.hermes-staging/`:

```python
STAGING_DIR = Path.home() / "github" / "knowledge" / "skills" / ".hermes-staging"
```

In `run_sync()`, after the Hermes → master contribution block, add:

```python
# Sync .hermes-staging → Master (agent contributions for Hermes review)
if STAGING_DIR.exists():
    print("📦 .hermes-staging → Master (agent contributions):")
    staging_skills = get_skills_in_dir(STAGING_DIR)
    master_skills = get_skills_in_dir(CONFIG["master_dir"])
    
    for skill in staging_skills:
        skill_path = STAGING_DIR / skill
        skill_md = skill_path / "SKILL.md"
        
        # Validation: must have SKILL.md
        if not skill_md.exists():
            print(f"  ⚠ Skipped {skill}: missing SKILL.md")
            continue
        
        if skill not in master_skills:
            if not dry_run:
                shutil.copytree(skill_path, CONFIG["master_dir"] / skill)
                shutil.rmtree(skill_path)  # Remove from staging after promotion
            results["sync"]["added"] += 1
            log_msg = f"  + {skill} (Gwen contribution via staging)"
            results["sync"]["logs"].append(log_msg)
            print(log_msg)
    print()
```

In `main()`, add JSONL event emission for staging contributions:
```python
if args.export_jsonl and not args.dry_run:
    for log_msg in results["sync"]["logs"]:
        if "Gwen contribution via staging" in log_msg:
            skill = log_msg.strip().lstrip("+ ").split(" ")[0]
            append_jsonl_event(skill, "contributed", "gwen")
```

### Staging Directory

`~/github/knowledge/skills/.hermes-staging/` [VERIFIED: EXISTS — created in Phase 9 with `.gitkeep`]

The dot-prefix ensures `get_skills_in_dir()` ignores it in master (the function already filters `d.name.startswith(".")`).

### Skill Format Requirement

Skills Gwen writes to staging must have `SKILL.md` with YAML frontmatter:
```yaml
---
name: skill-name
description: "..."
---
```
The validation gate in the pickup code checks for `SKILL.md` existence — invalid skills are skipped with a warning.

### Verification for AGENT-02

```bash
# 1. Staging directory exists
ls ~/github/knowledge/skills/.hermes-staging/

# 2. skill-sync.py picks up staging (dry run test)
# Create a test skill in staging:
mkdir -p ~/github/knowledge/skills/.hermes-staging/test-gwen-skill
cat > ~/github/knowledge/skills/.hermes-staging/test-gwen-skill/SKILL.md << 'EOF'
---
name: test-gwen-skill
description: "Test skill from Gwen"
---
# Test
EOF
python3 ~/github/knowledge/scripts/skill-sync.py --dry-run 2>&1 | grep "staging\|test-gwen"
# Cleanup:
rm -rf ~/github/knowledge/skills/.hermes-staging/test-gwen-skill

# 3. After code change: verify JSONL gets a "gwen" contributor event
python3 ~/github/knowledge/scripts/skill-sync.py --both --export-jsonl 2>&1 | tail -5
grep '"contributor": "gwen"' ~/github/knowledge/skill-contributions.jsonl | tail -3
```

---

## AGENT-03: Reflection Cron at 3am

### Current State

**No Gwen reflection cron exists anywhere.** [VERIFIED: full scan of `~/.hermes/cron/jobs.json` (18 jobs) and `~/.openclaw/cron/jobs.json`]

### Hermes Skill-Sync Cron Timing

**File:** `~/.hermes/cron/skill-sync.json`
**Schedule:** `0 4 * * *` (4am daily)
**Timezone:** NOT SET — no `tz` field [VERIFIED: file inspected]

When no tz is set, the Hermes cron scheduler uses the system timezone (America/Los_Angeles on this machine). The reflection cron must be set to 3am, meaning the 3am local (PDT/PST) slot is free.

**Collision check:** In Hermes cron `jobs.json`, "Daily Auto-Upgrade" is at `0 4 * * *` UTC (explicitly UTC), which equals ~8pm PDT — not a collision. The `skill-sync.json` 4am (system local = PDT) IS the slot to avoid.

### Cron Format

Hermes cron standalone files follow this JSON format [VERIFIED: skill-sync.json, skill-prune-weekly.json]:

```json
{
  "id": "gwen-reflection-3am",
  "name": "Gwen Daily Reflection",
  "prompt": "Run Gwen's daily self-improvement reflection cycle.\n\nSteps:\n1. Read ~/.openclaw/workspace-gwen/.learnings/LEARNINGS.md for pending entries\n2. Read ~/.openclaw/workspace-gwen/.learnings/ERRORS.md for unresolved errors\n3. Identify any learnings that qualify for promotion to AGENTS.md, SOUL.md, or TOOLS.md\n4. For learnings that meet promotion criteria (Recurrence-Count >= 3 OR Priority: critical/high), promote them\n5. POST significant learnings to http://localhost:3201/memory/add with agent_id='gwen'\n6. Update .learnings/ entry status from 'pending' to 'promoted' or 'reviewed'\n7. If new skills were created this session, move them to ~/github/knowledge/skills/.hermes-staging/<skill-name>/\n8. Reply HEARTBEAT_OK if nothing needed attention.\n\nDeliver results to: discord:#skills",
  "schedule": {
    "kind": "cron",
    "expr": "0 3 * * *",
    "tz": "America/Los_Angeles",
    "display": "Daily at 3:00 AM PDT"
  },
  "enabled": true,
  "deliver": "discord:#skills",
  "origin": null
}
```

**File location:** `~/.hermes/cron/gwen-reflection.json`

**Why standalone file vs. adding to jobs.json:**
- Both `skill-sync.json` and `skill-prune-weekly.json` are standalone files that Hermes's cron scheduler picks up automatically from `~/.hermes/cron/`
- Standalone files are safer — no risk of corrupting `jobs.json` with 18 existing jobs
- Pattern is consistent with how Hermes was already set up

**Explicit `tz: 'America/Los_Angeles'`** is mandatory. The `skill-sync.json` has no tz (ambiguous). The Gwen reflection must be explicit so 3am always means 3am PDT regardless of DST transitions.

### Verification for AGENT-03

```bash
# 1. File exists
ls ~/.hermes/cron/gwen-reflection.json

# 2. Hermes picks it up (check scheduler recognizes it)
# Wait until after 3am and check the output directory:
ls ~/.hermes/cron/output/ | grep "gwen-reflection" | sort | tail -3

# 3. Confirm no 4am collision (timing verification)
python3 -c "
import json
# Check skill-sync is still at 4am
d = json.load(open('/Users/lcalderon/.hermes/cron/skill-sync.json'))
expr = d['schedule']['expr']
print('skill-sync cron:', expr)
# Check gwen-reflection is at 3am
d2 = json.load(open('/Users/lcalderon/.hermes/cron/gwen-reflection.json'))
expr2 = d2['schedule']['expr']
tz2 = d2['schedule'].get('tz','NO TZ')
print('gwen-reflection cron:', expr2, 'tz:', tz2)
print('PASS' if expr != expr2 else 'FAIL: cron expressions match!')
"
```

---

## Architecture Patterns

### Hermes Cron Standalone File Pattern

```
~/.hermes/cron/
├── jobs.json              # Main OpenClaw jobs (managed by UI/API)
├── skill-sync.json        # Standalone: daily 4am skill sync
├── skill-prune-weekly.json # Standalone: Sunday 5am prune
└── gwen-reflection.json   # TO CREATE: daily 3am reflection
```

Hermes's cron scheduler auto-discovers JSON files in `~/.hermes/cron/`. No registration needed beyond creating the file. [VERIFIED: skill-sync.json and skill-prune-weekly.json exist and run successfully on their schedules]

### skill-sync.py Sync Directions (After This Phase)

```
master_dir      ──→  openclaw_dir     (skill distribution to Gwen's runtime)
master_dir      ──→  hermes_dir       (optional skills for Hermes)
hermes_dir      ──→  master_dir       (Hermes contributions)
.hermes-staging ──→  master_dir       (Gwen contributions — NEW in this phase)
```

### Memory Write Path for Gwen

```
Gwen session → .learnings/ files (local, session-scoped)
                    ↓ (via reflection cron at 3am)
              POST localhost:3201/memory/add (agent_id="gwen")
                    ↓
              mem0 → Qdrant agent_memory (automatic — mem0 manages this)
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Skill pickup from staging | New Python script | Extend `skill-sync.py` | One sync engine, Hermes already uses it |
| mem0 write logic | Custom Qdrant client | `POST localhost:3201/memory/add` | mem0 owns the agent_memory collection |
| Cron registration | New scheduler | Hermes cron JSON file | Already running, standalone file pattern works |
| Skill validation | Full YAML parser | `Path.exists()` on SKILL.md | Sufficient gate per kickoff spec |

---

## Common Pitfalls

### Pitfall 1: skill-sync.py Staging Not Triggered

**What goes wrong:** `.hermes-staging/` directory exists, Gwen writes skills there, but the 4am skill-sync never promotes them to master because no staging pickup logic exists.

**Why it happens:** The CONFIG dict and run_sync() have no STAGING_DIR reference. The skill just sits indefinitely.

**How to avoid:** Add the staging → master sync direction to skill-sync.py before declaring AGENT-02 done.

**Warning signs:** Skills accumulate in `.hermes-staging/` without appearing in master or `~/.openclaw/skills/`.

### Pitfall 2: Cron Timezone Collision

**What goes wrong:** Gwen reflection cron fires at the same time as Hermes skill-sync, causing both to run concurrently. Memory writes from Gwen's reflection land while skill-sync is also reading the state file.

**Why it happens:** `skill-sync.json` has no `tz` field — defaults to system local (PDT). If Gwen's cron also uses system local at 3am, they run 1 hour apart. But if the system timezone changes, a misconfigured cron could shift into the 4am slot.

**How to avoid:** Always set `tz: 'America/Los_Angeles'` explicitly on Gwen's cron. The planner must not omit this field.

**Warning signs:** Both crons show the same `next_run_at` timestamp in Hermes output.

### Pitfall 3: Cognee Gets Installed Later

**What goes wrong:** Someone runs `clawdhub install cognee-openclaw` or a future OpenClaw upgrade pulls it in, creating a parallel memory layer that writes to a different store.

**Why it happens:** Cognee is a popular OpenClaw plugin. It's not installed now but nothing prevents future installation.

**How to avoid:** The AGENTS.md already says "Never enable Cognee-OpenClaw." The constraint is documented. The planner should NOT add an automated Cognee check — documentation is the right control for this.

**Warning signs:** `~/.openclaw/plugins/cognee*` or `~/.openclaw/extensions/cognee*` appears.

### Pitfall 4: Skills Written to Wrong Path

**What goes wrong:** Gwen writes new skills to `~/skills/` (ClawHub silo) instead of `~/github/knowledge/skills/.hermes-staging/`. Skills bypass Hermes review and never appear in the dashboard.

**Why it happens:** The `clawdhub install` default target is `~/skills/`. A newly onboarded skill might use this default.

**How to avoid:** AGENTS.md already documents the correct path. The skill-sync.py staging pickup only reads from `.hermes-staging/` — skills in `~/skills/` are in the `clawhub_dir` and are NOT promoted to master by skill-sync.

**Warning signs:** Gwen contributions show 0 in the dashboard despite Gwen creating skills.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| OpenClaw | AGENT-01, 03 | Yes | 2026.4.11 (769908e) | — |
| clawdhub CLI | AGENT-01 (reinstall if needed) | Yes | 0.7.0 | Manual git clone |
| mem0 service | AGENT-01, 03 | Yes (port 3201) | healthy | — |
| Hermes cron scheduler | AGENT-03 | Yes | — | — |
| `skill-sync.py` | AGENT-02 | Yes (352 lines) | — | — |
| `.hermes-staging/` | AGENT-02 | Yes (exists) | — | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual verification (no automated test suite for this phase) |
| Config file | N/A |
| Quick run command | See verification snippets in each section above |
| Full suite command | Run all 3 verification blocks in sequence |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGENT-01 | Skill installed, Cognee absent, mem0 healthy | smoke | `ls ~/.openclaw/skills/self-improving-agent/SKILL.md && curl -s http://localhost:3201/health` | N/A — runtime check |
| AGENT-02 | staging pickup promotes skill to master | integration | `mkdir test staging skill + python3 skill-sync.py --dry-run` | Code not yet written |
| AGENT-03 | Cron file exists with correct expr and tz | config | `python3 -c "import json; d=json.load(open('~/.hermes/cron/gwen-reflection.json')); assert d['schedule']['expr']=='0 3 * * *'"` | File not yet created |

### Wave 0 Gaps

- [ ] `~/.hermes/cron/gwen-reflection.json` — create cron file (AGENT-03)
- [ ] staging pickup logic in `skill-sync.py` — code addition (AGENT-02)

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | skill-sync.py validates SKILL.md presence before promoting staging skills |
| V6 Cryptography | no | no crypto needed |
| V2 Authentication | no | mem0 is localhost-only, no auth needed |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Staging directory path traversal | Tampering | `get_skills_in_dir()` only returns `is_dir()` entries; dot-prefix filtering prevents hidden dir exploitation |
| mem0 agent_id spoofing | Spoofing | mem0 is localhost-only, no external access |
| Skill injection via SKILL.md | Tampering | Skills staged by Gwen are reviewed by Hermes before promotion to master (the pickup + human review window) |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Hermes cron scheduler auto-discovers all JSON files in `~/.hermes/cron/` without registration | AGENT-03 | Cron file would be ignored; reflection never runs. Mitigation: verify by checking `~/.hermes/cron/output/` after creating the file. |
| A2 | `skill-sync.json` with no `tz` field defaults to system local (America/Los_Angeles) | AGENT-03 | Timezone collision calculation could be wrong. Low risk: system is confirmed macOS on LA timezone. |

---

## Sources

### Primary (HIGH confidence — verified by filesystem inspection)

- `~/.openclaw/skills/self-improving-agent/SKILL.md` — skill capabilities, setup, hook options
- `~/.openclaw/workspace-gwen/AGENTS.md` — Gwen's constraints, current documented state
- `~/github/knowledge/scripts/skill-sync.py` (352 lines) — full sync logic, CONFIG dict, all sync directions
- `~/.hermes/cron/skill-sync.json` — Hermes skill-sync cron timing (4am, no tz)
- `~/.hermes/cron/jobs.json` — all 18 existing Hermes cron jobs (no reflection job found)
- `~/.openclaw/plugins/` and `~/.openclaw/extensions/` — Cognee confirmed absent
- `curl http://localhost:3201/health` — mem0 service confirmed running

### Secondary (MEDIUM confidence)

- `~/.planning/v1.2-KICKOFF.md` Feature E section — architectural intent for Gwen setup

---

## Metadata

**Confidence breakdown:**
- AGENT-01 current state: HIGH — all files verified
- AGENT-02 gap (skill-sync missing staging): HIGH — read full script, CONFIG dict confirmed
- AGENT-03 cron format: HIGH — verified against two working examples (skill-sync.json, skill-prune-weekly.json)
- A1 assumption (auto-discovery): MEDIUM — inferred from pattern, not traced through Hermes scheduler source

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable config, 30-day window)
