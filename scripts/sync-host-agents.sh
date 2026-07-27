#!/usr/bin/env bash
# Make this host's agent registry reflect the agent harnesses ACTUALLY
# installed here — nothing else.
#
# Why this exists: the registry was seeded from agents.config.json, an
# operator-wide list. cordant-hermes-01 ended up advertising "Cursor Desktop"
# and "Codex Desktop" (sessions on a laptop) and then the OpenClaw crew
# (Sophia, Maria, Gwen — personas that run elsewhere). None of them were on
# that machine. The only trustworthy answer is to look at the machine.
#
# Detection must run on the HOST, not in the container: the app image has its
# own $HOME and none of the harness binaries, so an in-container scan finds
# nothing.
#
# A harness counts as present when its binary resolves AND it has a config
# directory — a binary alone can arrive as a transitive dependency.
#
# Safe by construction:
#   - agents are deregistered, never deleted (reversible)
#   - anything with a heartbeat or a current task is left alone, even if it is
#     not detected, so a live agent is never removed by a stale scan
#   - --dry-run prints the plan and changes nothing
#
# Usage:
#   bash scripts/sync-host-agents.sh [--dry-run] [--container NAME]

set -euo pipefail

DRY_RUN=0
CONTAINER="${CONTAINER_NAME:-memroos-local-memroos-1}"
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --container) CONTAINER="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

HOST_ID="${MEMROOS_HOST_ID:-$(hostname)}"

# --- detect -----------------------------------------------------------------
# bin:name:platform:configdir
PROBES="
claude:Claude Code:claude:.claude
codex:Codex:codex:.codex
pi:Pi:pi:.pi
openclaw:OpenClaw:openclaw:.openclaw
cursor-agent:Cursor Agent:cursor:.cursor
qwen:Qwen:qwen:.qwen
gemini:Gemini:gemini:.gemini
opencode:OpenCode:opencode:.config/opencode
zcode:ZCode:zcode:.zcode
"

detected="[]"
add_agent() {
  detected=$(printf '%s' "$detected" | python3 -c "
import sys, json
items = json.load(sys.stdin)
items.append({
  'id': sys.argv[1], 'name': sys.argv[2], 'role': sys.argv[3],
  'platform': sys.argv[4], 'version': sys.argv[5] or None,
})
print(json.dumps(items))
" "$1" "$2" "$3" "$4" "${5:-}")
}

while IFS= read -r line; do
  [ -z "$line" ] && continue
  bin="${line%%:*}"; rest="${line#*:}"
  name="${rest%%:*}"; rest="${rest#*:}"
  platform="${rest%%:*}"; cfg="${rest#*:}"

  [ -e "$HOME/$cfg" ] || continue
  path=$(command -v "$bin" 2>/dev/null) || continue
  ver=$(timeout 10 "$path" --version 2>/dev/null | head -1 || true)
  add_agent "${HOST_ID}:${bin}" "$name" "Coding agent (CLI)" "$platform" "$ver"
done <<< "$PROBES"

# Runtimes with no single binary on PATH.
if [ -d "$HOME/.hermes/hermes-agent" ]; then
  add_agent "${HOST_ID}:hermes" "Hermes" "Agent runtime" "hermes" ""
fi

count=$(printf '%s' "$detected" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
echo "[sync-host-agents] host=$HOST_ID detected=$count"
printf '%s' "$detected" | python3 -c "
import sys, json
for a in json.load(sys.stdin):
    print(f\"  - {a['id']:34} {a['name']:16} {a.get('version') or ''}\")
"

if [ "$count" -eq 0 ]; then
  echo "[sync-host-agents] no harnesses detected — refusing to empty the registry" >&2
  exit 1
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[sync-host-agents] --dry-run: no changes made"
  exit 0
fi

# --- apply ------------------------------------------------------------------
printf '%s' "$detected" > /tmp/host-agents.json
cat > /tmp/sync-agents.js <<'JSEOF'
const fs = require("fs");
const Database = require("better-sqlite3");

const detected = JSON.parse(fs.readFileSync("/tmp/host-agents.json", "utf8"));
const db = new Database(process.env.SQLITE_DB_PATH || "/data/conversations.db");
const now = new Date().toISOString();
const keep = new Set(detected.map((a) => a.id));

const upsert = db.prepare(`
  INSERT INTO registered_agents
    (id, name, role, platform, protocol, status, location, host,
     metadata, created_at, updated_at, deregistered_at)
  VALUES (@id, @name, @role, @platform, 'rest', 'dormant', 'local', @host,
          @metadata, @now, @now, NULL)
  ON CONFLICT(id) DO UPDATE SET
    platform        = excluded.platform,
    updated_at      = excluded.updated_at,
    deregistered_at = NULL
`);
// name and role are deliberately NOT overwritten on conflict: the operator can
// rename an agent in the UI, and a re-sync must not undo that.

const tx = db.transaction(() => {
  for (const a of detected) {
    upsert.run({
      id: a.id, name: a.name, role: a.role, platform: a.platform,
      host: process.env.MEMROOS_HOST_ID || null, now,
      metadata: JSON.stringify({ detected: true, version: a.version ?? null }),
    });
  }

  const live = db
    .prepare("SELECT id, name, last_heartbeat_at, current_task FROM registered_agents WHERE deregistered_at IS NULL")
    .all();
  const stale = live.filter(
    (r) => !keep.has(r.id) && !r.last_heartbeat_at && !r.current_task
  );
  const protectedRows = live.filter(
    (r) => !keep.has(r.id) && (r.last_heartbeat_at || r.current_task)
  );

  const dereg = db.prepare("UPDATE registered_agents SET deregistered_at = ? WHERE id = ?");
  for (const r of stale) dereg.run(now, r.id);

  console.log(`registered/refreshed: ${detected.length}`);
  console.log(`deregistered (not installed, no activity): ${stale.length}`);
  if (protectedRows.length) {
    console.log(`KEPT despite not being detected (has activity): ${protectedRows.map((r) => r.id).join(", ")}`);
  }
});
tx();

for (const r of db.prepare("SELECT id, name FROM registered_agents WHERE deregistered_at IS NULL ORDER BY id").all()) {
  console.log(`  - ${r.id}  |  ${r.name}`);
}
JSEOF

docker cp /tmp/host-agents.json "$CONTAINER:/tmp/host-agents.json" >/dev/null
docker cp /tmp/sync-agents.js "$CONTAINER:/app/sync-agents.js" >/dev/null
docker exec -e MEMROOS_HOST_ID="$HOST_ID" "$CONTAINER" sh -c "cd /app && node sync-agents.js; rm -f sync-agents.js /tmp/host-agents.json"
rm -f /tmp/sync-agents.js /tmp/host-agents.json
echo "[sync-host-agents] done"
