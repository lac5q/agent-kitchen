import { verifyAgentOnboardingToken } from "@/lib/agent-onboarding";

export const dynamic = "force-dynamic";

const SCRIPT = String.raw`#!/usr/bin/env bash
set -euo pipefail

TOKEN="__TOKEN__"
MEMROOS_URL="__MEMROOS_URL__"

AGENT_ID=""
AGENT_NAME=""
AGENT_ROLE=""
PLATFORM=""
PROTOCOL="rest"
LOCATION="local"
MCP_TARGET="\${MEMROOS_MCP_TARGET:-auto}"

slugify() {
  python3 - "$1" <<'PY'
import re
import sys

value = sys.argv[1].strip().lower()
slug = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
print(slug or "agent")
PY
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --id) AGENT_ID="\${2:?--id requires a value}"; shift 2 ;;
    --name) AGENT_NAME="\${2:?--name requires a value}"; shift 2 ;;
    --role) AGENT_ROLE="\${2:?--role requires a value}"; shift 2 ;;
    --platform) PLATFORM="\${2:?--platform requires a value}"; shift 2 ;;
    --protocol) PROTOCOL="\${2:?--protocol requires a value}"; shift 2 ;;
    --location) LOCATION="\${2:?--location requires a value}"; shift 2 ;;
    --mcp-target) MCP_TARGET="\${2:?--mcp-target requires a value}"; shift 2 ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

AGENT_ID="\${AGENT_ID:-\${MEMROOS_AGENT_ID:-}}"
AGENT_NAME="\${AGENT_NAME:-\${MEMROOS_AGENT_NAME:-}}"
AGENT_ROLE="\${AGENT_ROLE:-\${MEMROOS_AGENT_ROLE:-MemroOS agent}}"
PLATFORM="\${PLATFORM:-\${MEMROOS_PLATFORM:-}}"

if [[ -z "$PLATFORM" ]]; then
  echo "Usage: onboard [--id <id>] [--name <name>] [--role <role>] --platform <cursor|chatgpt|grok|droid|codex|claude|cline|opencode|zcode|openclaw|hermes|gemini|qwen|pi> [--mcp-target auto|stdout|cursor|codex|claude|cline|gemini|qwen|opencode|zcode|openclaw|hermes|droid|none|file:/path]" >&2
  exit 2
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for MemroOS onboarding" >&2
  exit 1
fi

if [[ -z "$AGENT_NAME" ]]; then
  AGENT_NAME="\${USER:-Agent}@$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo local)"
fi
if [[ -z "$AGENT_ID" ]]; then
  AGENT_ID="$(slugify "$AGENT_NAME")"
fi

payload="$(python3 - "$TOKEN" "$AGENT_ID" "$AGENT_NAME" "$AGENT_ROLE" "$PLATFORM" "$PROTOCOL" "$LOCATION" <<'PY'
import json
import sys

token, agent_id, name, role, platform, protocol, location = sys.argv[1:]
print(json.dumps({
    "token": token,
    "id": agent_id,
    "name": name,
    "role": role,
    "platform": platform,
    "protocol": protocol,
    "location": location,
    "issueApiKey": True,
}))
PY
)"

response="$(curl -fsSL "\${MEMROOS_URL}/api/onboarding/register" \
  -H 'Content-Type: application/json' \
  -d "$payload")"

mkdir -p "$HOME/.memroos"
chmod 700 "$HOME/.memroos"

python3 - "$response" "$AGENT_ID" "$MCP_TARGET" "$PLATFORM" <<'PY'
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import sys

body = json.loads(sys.argv[1])
agent_id = sys.argv[2]
target = sys.argv[3]
platform = sys.argv[4]
if not body.get("ok"):
    raise SystemExit(body.get("error", "MemroOS onboarding failed"))

home = pathlib.Path.home()
state_dir = home / ".memroos"
env_path = state_dir / f"{agent_id}.env"
api_key = body.get("apiKey", "")
env_path.write_text(
    f"MEMROOS_URL={body['env']['MEMROOS_URL']}\n"
    f"MEMROOS_AGENT_ID={body['env']['MEMROOS_AGENT_ID']}\n"
    f"MEMROOS_AGENT_API_KEY={api_key}\n",
    encoding="utf-8",
)
env_path.chmod(stat.S_IRUSR | stat.S_IWUSR)

mcp = body["mcp"]
mcp_servers = mcp["mcpServers"]
mcp_url = mcp_servers["memroos"]["url"]
generic_entry = {"url": mcp_url}
http_entry = {"type": "http", "url": mcp_url}
streamable_entry = {"url": mcp_url, "transport": "streamable-http"}
http_url_entry = {"httpUrl": mcp_url}
generic_servers = {"memroos": generic_entry}
http_url_servers = {"memroos": http_url_entry}
streamable_servers = {"memroos": streamable_entry}
report = {"agentId": agent_id, "platform": platform, "target": target, "actions": []}

def remember(action, status, detail):
    report["actions"].append({"action": action, "status": status, "detail": detail})

def run_if_available(binary, args):
    if not shutil.which(binary):
        remember(binary, "missing", f"{binary} not found on PATH")
        return False
    result = subprocess.run([binary, *args], text=True, capture_output=True)
    if result.returncode == 0:
        remember(binary, "ok", " ".join([binary, *args]))
        return True
    detail = (result.stderr or result.stdout or "").strip()[:500]
    remember(binary, "failed", detail)
    return False

def deep_merge(left, right):
    merged = dict(left)
    for key, value in right.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged

def merge_json(path, update):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            backup = path.with_suffix(path.suffix + ".memroos-backup")
            backup.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
            existing = {}
    else:
        existing = {}
    path.write_text(json.dumps(deep_merge(existing, update), indent=2) + "\n", encoding="utf-8")
    remember("write-json", "ok", str(path))

def merge_hermes_yaml(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        import yaml  # type: ignore
    except Exception:
        if not path.exists():
            path.write_text(f"mcp_servers:\n  memroos:\n    url: {json.dumps(mcp_url)}\n", encoding="utf-8")
            remember("write-hermes-yaml", "ok", str(path))
        else:
            sidecar = path.parent / "memroos.mcp.yaml"
            sidecar.write_text(f"mcp_servers:\n  memroos:\n    url: {json.dumps(mcp_url)}\n", encoding="utf-8")
            remember("write-hermes-yaml", "fallback", f"Wrote {sidecar}; install PyYAML for safe merge into {path}")
        return

    data = {}
    if path.exists():
        loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
        data = loaded if isinstance(loaded, dict) else {}
    servers = data.setdefault("mcp_servers", {})
    servers["memroos"] = {"url": mcp_url}
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")
    remember("write-hermes-yaml", "ok", str(path))

def merge_codex_toml(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    table = "[mcp_servers.memroos]"
    block = (
        "# MemRoOS MCP added by MemRoOS onboarding.\n"
        f"{table}\n"
        f"url = {json.dumps(mcp_url)}\n"
    )
    if path.exists():
        text = path.read_text(encoding="utf-8")
        if table in text:
            updated = re.sub(
                r"(?ms)^(?:# MemRoOS MCP added by MemRoOS onboarding\.\n)?\[mcp_servers\.memroos\]\n.*?(?=^\[|\Z)",
                block.rstrip() + "\n\n",
                text,
                count=1,
            )
            if updated == text:
                sidecar = path.parent / "memroos.mcp.config.toml"
                sidecar.write_text(block, encoding="utf-8")
                remember("write-codex-toml", "fallback", f"Existing {table} in {path}; wrote {sidecar}")
                return
            path.write_text(updated.rstrip() + "\n", encoding="utf-8")
            remember("write-codex-toml", "ok", str(path))
            return
        text = text.rstrip() + "\n\n" + block
    else:
        text = block
    path.write_text(text, encoding="utf-8")
    remember("write-codex-toml", "ok", str(path))

def install_claude():
    ok = run_if_available("claude", ["mcp", "add", "--transport", "http", "memroos", "--scope", "user", mcp_url])
    return ok

def install_cline():
    # Cline stores MCP servers in VS Code's globalStorage per-platform.
    if sys.platform == "darwin":
        settings_dir = home / "Library" / "Application Support" / "Code" / "User" / "globalStorage" / "saoudrizwan.claude-dev" / "settings"
    elif os.name == "nt":
        app_data = os.environ.get("APPDATA")
        if not app_data:
            raise SystemExit("APPDATA is required to configure Cline on Windows")
        settings_dir = pathlib.Path(app_data) / "Code" / "User" / "globalStorage" / "saoudrizwan.claude-dev" / "settings"
    else:
        settings_dir = home / ".config" / "Code" / "User" / "globalStorage" / "saoudrizwan.claude-dev" / "settings"
    merge_json(settings_dir / "cline_mcp_settings.json", {"mcpServers": generic_servers})
    return True

def install_gemini():
    if run_if_available("gemini", ["mcp", "add", "--scope", "user", "--transport", "http", "memroos", mcp_url]):
        return True
    merge_json(home / ".gemini" / "settings.json", {"mcpServers": http_url_servers})
    return True

def install_qwen():
    if run_if_available("qwen", ["mcp", "add", "--scope", "user", "--transport", "http", "memroos", mcp_url]):
        return True
    merge_json(home / ".qwen" / "settings.json", {"mcpServers": http_url_servers})
    return True

def install_openclaw():
    if run_if_available("openclaw", ["mcp", "set", "memroos", json.dumps(streamable_entry)]):
        return True
    merge_json(home / ".openclaw" / "openclaw.json", {"mcp": {"servers": streamable_servers}})
    return True

def install_opencode():
    merge_json(home / ".config" / "opencode" / "opencode.json", {
        "$schema": "https://opencode.ai/config.json",
        "mcp": {
            "memroos": {
                "type": "remote",
                "url": mcp_url,
                "enabled": True,
            }
        },
    })
    return True

def install_zcode():
    merge_json(home / ".zcode" / "cli" / "config.json", {
        "mcp": {
            "servers": {
                "memroos": {
                    "type": "http",
                    "url": mcp_url,
                    "enabled": True,
                    "timeoutMs": 60000,
                }
            }
        }
    })
    return True

def install_hermes():
    if run_if_available("hermes", ["mcp", "add", "memroos", "--url", mcp_url]):
        return True
    merge_hermes_yaml(home / ".hermes" / "config.yaml")
    return True

def install_droid():
    ok = run_if_available("droid", ["mcp", "add", "--type", "http", "memroos", mcp_url])
    return ok

def install_codex():
    if run_if_available("codex", ["mcp", "add", "memroos", "--url", mcp_url]):
        return True
    merge_codex_toml(home / ".codex" / "config.toml")
    return True

def install_cursor():
    merge_json(pathlib.Path.cwd() / ".cursor" / "mcp.json", {"mcpServers": generic_servers})
    return True

def install_file(path_value):
    path = pathlib.Path(path_value).expanduser()
    merge_json(path, {"mcpServers": generic_servers})
    return True

def install_explicit(selected):
    if selected == "none":
        remember("mcp-target", "skipped", "none")
        return True
    if selected == "stdout":
        print(json.dumps(mcp, indent=2))
        remember("mcp-target", "ok", "stdout")
        return True
    if selected.startswith("file:"):
        return install_file(selected[5:])
    installers = {
        "codex": install_codex,
        "droid": install_droid,
        "claude": install_claude,
        "cline": install_cline,
        "gemini": install_gemini,
        "qwen": install_qwen,
        "opencode": install_opencode,
        "zcode": install_zcode,
        "openclaw": install_openclaw,
        "hermes": install_hermes,
        "cursor": install_cursor,
    }
    installer = installers.get(selected)
    if installer is None:
        raise SystemExit(f"Unknown --mcp-target {selected}")
    return installer()

def install_auto():
    platform_targets = {
        "cursor": "cursor",
        "chatgpt": "stdout",
        "grok": "stdout",
        "codex": "codex",
        "droid": "droid",
        "claude": "claude",
        "cline": "cline",
        "gemini": "gemini",
        "qwen": "qwen",
        "pi": "stdout",
        "openclaw": "openclaw",
        "opencode": "opencode",
        "zcode": "zcode",
        "hermes": "hermes",
    }
    return install_explicit(platform_targets.get(platform, "stdout"))

if target == "auto":
    install_auto()
elif target == "none":
    pass
else:
    install_explicit(target)

report_path = state_dir / f"{agent_id}.onboarding-report.json"
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

print(f"MemroOS onboarded {agent_id}")
print(f"Credentials written to {env_path}")
print(f"Onboarding report written to {report_path}")
PY
`.replaceAll("\\${", "${");

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const verified = verifyAgentOnboardingToken(token);
  if (!verified.ok) {
    return new Response(verified.error, { status: 403, headers: { "content-type": "text/plain" } });
  }

  return new Response(
    SCRIPT.replace("__TOKEN__", token).replace("__MEMROOS_URL__", verified.payload.memroosUrl),
    { headers: { "content-type": "text/x-shellscript; charset=utf-8" } }
  );
}
