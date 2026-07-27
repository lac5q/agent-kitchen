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
#   - refuses to run when detection finds far fewer agents than are already
#     registered, so it cannot gut a registration hub like oracle-1 (whose
#     agents register over the API and are not host-installed CLIs)
#
# Detected agents are ONBOARDED, not just listed: each gets an API key and a
# first heartbeat, because a registry row alone shows "liveness: never" and
# cannot call /api/heartbeat (that endpoint requires Bearer <agent key>).
# Keys are written to ~/.memroos/agent-keys/<id>.key, mode 600, and never
# printed.
#
# Usage:
#   bash scripts/sync-host-agents.sh [--dry-run] [--container NAME] [--force]

set -euo pipefail

DRY_RUN=0
FORCE=0
CONTAINER="${CONTAINER_NAME:-memroos-local-memroos-1}"
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --force) FORCE=1; shift ;;
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
const crypto = require("crypto");
const Database = require("better-sqlite3");

const force = process.env.SYNC_FORCE === "1";

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

  // HUB GUARD. On a registration hub (oracle-1: 59 agents that register over
  // the API and are not host-installed CLIs) detection finds ~1 binary, and
  // deregistering the rest would destroy real state. Refuse when the sweep
  // would remove most of the registry.
  if (!force && live.length >= 10 && stale.length > live.length / 2) {
    throw new Error(
      `refusing to deregister ${stale.length} of ${live.length} agents — ` +
      `this host looks like a registration hub, not a workstation. ` +
      `Re-run with --force if you are certain.`
    );
  }

  const dereg = db.prepare("UPDATE registered_agents SET deregistered_at = ? WHERE id = ?");
  for (const r of stale) dereg.run(now, r.id);

  // ONBOARD: a registry row alone renders "liveness: never" and cannot call
  // /api/heartbeat, which requires `Bearer <agent key>`. Issue a key for any
  // detected agent that lacks one, and record a first heartbeat so the agent
  // is live immediately rather than waiting for its first self-report.
  const hasKey = db.prepare(
    "SELECT 1 FROM agent_api_keys WHERE agent_id = ? AND revoked_at IS NULL LIMIT 1"
  );
  const insertKey = db.prepare(
    "INSERT INTO agent_api_keys (agent_id, key_prefix, key_hash) VALUES (?, ?, ?)"
  );
  const beat = db.prepare(
    "UPDATE registered_agents SET last_heartbeat_at = ?, status = 'idle', updated_at = ? WHERE id = ?"
  );
  const issued = [];
  for (const a of detected) {
    if (!hasKey.get(a.id)) {
      // Mirrors generateApiKey/createAgentApiKey in lib/agent-registry.ts.
      const key = `ak_${a.id}_${crypto.randomBytes(32).toString("base64url")}`;
      insertKey.run(a.id, key.slice(0, 12), crypto.createHash("sha256").update(key).digest("hex"));
      issued.push({ id: a.id, key });
    }
    beat.run(now, now, a.id);
  }
  fs.writeFileSync("/tmp/issued-keys.json", JSON.stringify(issued));

  console.log(`registered/refreshed: ${detected.length}`);
  console.log(`api keys issued: ${issued.length}`);
  console.log(`heartbeat recorded: ${detected.length}`);
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
docker exec -e MEMROOS_HOST_ID="$HOST_ID" -e SYNC_FORCE="$FORCE" "$CONTAINER" \
  sh -c "cd /app && node sync-agents.js; rm -f sync-agents.js /tmp/host-agents.json"

# Persist any freshly-issued keys to the host, 600, one file per agent. The
# values are moved via docker cp and never echoed.
KEYS_DIR="${HOME}/.memroos/agent-keys"
mkdir -p "$KEYS_DIR"; chmod 700 "$KEYS_DIR"
if docker cp "$CONTAINER:/tmp/issued-keys.json" /tmp/issued-keys.json >/dev/null 2>&1; then
  python3 - "$KEYS_DIR" <<'PYEOF'
import json, os, sys
keys_dir = sys.argv[1]
try:
    issued = json.load(open("/tmp/issued-keys.json"))
except Exception:
    issued = []
for item in issued:
    path = os.path.join(keys_dir, item["id"].replace("/", "_") + ".key")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as fh:
        fh.write(item["key"] + "\n")
    print(f"  key -> {path}")
PYEOF
  rm -f /tmp/issued-keys.json
  docker exec "$CONTAINER" rm -f /tmp/issued-keys.json 2>/dev/null || true
fi

rm -f /tmp/sync-agents.js /tmp/host-agents.json
echo "[sync-host-agents] done"
