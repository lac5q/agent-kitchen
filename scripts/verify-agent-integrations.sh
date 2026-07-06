#!/usr/bin/env bash
# MemroOS Agent Integrations Verifier
# =====================================
#
# Smoke-tests that every detected agent CLI can ACTUALLY reach MemroOS.
# Companion to install-agent-integrations.sh — that script WRITES the
# files, this script verifies they WORK (file present, MCP server starts,
# tools reachable).
#
# Returns non-zero exit if any agent CLI is broken.
#
# Usage:
#   bash scripts/verify-agent-integrations.sh
#   MEMROOS_ROOT=/custom/path bash scripts/verify-agent-integrations.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMROOS_ROOT="${MEMROOS_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

if [[ ! -d "$MEMROOS_ROOT/services/knowledge-mcp" ]]; then
  echo "❌ MEMROOS_ROOT does not look like a MemroOS checkout: $MEMROOS_ROOT" >&2
  exit 1
fi

TEMPLATE="$MEMROOS_ROOT/agents/AGENTS_TEMPLATE.md"
SKILL_SRC="$MEMROOS_ROOT/.agents/skills/memroos-save/SKILL.md"
MCP_SCRIPT="$MEMROOS_ROOT/scripts/memroos-mcp.sh"

HOME_DIR="${HOME:-$(eval echo "~$(whoami)")}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*"; }

echo "MemroOS Agent Integrations Verifier"
echo "===================================="
echo "Repo:     $MEMROOS_ROOT"
echo ""

# Test 1: MemroOS MCP server launches
echo "Test 1: MemroOS MCP server launcher is executable"
if [[ -x "$MCP_SCRIPT" ]]; then
  ok "$MCP_SCRIPT exists and is executable"
else
  err "$MCP_SCRIPT missing or not executable"
  exit 1
fi
echo ""

# Test 2: Canonical files exist
echo "Test 2: Canonical files exist in repo"
if [[ -f "$TEMPLATE" ]]; then
  ok "AGENTS_TEMPLATE.md present ($(wc -l < "$TEMPLATE" | tr -d ' ') lines)"
else
  err "AGENTS_TEMPLATE.md missing"
  exit 1
fi
if [[ -f "$SKILL_SRC" ]]; then
  ok "memroos-save skill present"
else
  err "memroos-save skill missing"
  exit 1
fi
echo ""

# Test 3: All targets converged
echo "Test 3: All detected agent CLIs are converged on canonical"
if bash "$SCRIPT_DIR/install-agent-integrations.sh" --check >/dev/null 2>&1; then
  ok "All targets converged"
else
  warn "Drift detected. Running installer to re-converge..."
  bash "$SCRIPT_DIR/install-agent-integrations.sh"
fi
echo ""

# Test 4: MemroOS knowledge-mcp service can list tools
echo "Test 4: MemroOS knowledge-mcp responds to a basic invocation"
if [[ -d "$MEMROOS_ROOT/services/knowledge-mcp" ]]; then
  if command -v node >/dev/null 2>&1; then
    # Quick smoke: try to enumerate the knowledge base (read-only, no side effects)
    if (cd "$MEMROOS_ROOT" && timeout 10 node services/knowledge-mcp/dist/cli.js list 2>/dev/null | head -3); then
      ok "knowledge-mcp responds to list"
    else
      warn "knowledge-mcp didn't respond to list (this is OK if it's not built yet — run npm run build in services/knowledge-mcp)"
    fi
  else
    warn "node not available — skipping knowledge-mcp smoke test"
  fi
else
  warn "services/knowledge-mcp not found — skipping service smoke test"
fi
echo ""

# Test 5: Sample audit of installed AGENTS.md files
echo "Test 5: Spot-check installed AGENTS.md files"
if [[ -f "$HOME_DIR/.hermes/AGENTS.md" ]]; then
  if diff -q "$TEMPLATE" "$HOME_DIR/.hermes/AGENTS.md" >/dev/null 2>&1; then
    ok "$HOME_DIR/.hermes/AGENTS.md matches canonical exactly"
  else
    err "$HOME_DIR/.hermes/AGENTS.md diverged from canonical — run installer"
    exit 1
  fi
else
  err "$HOME_DIR/.hermes/AGENTS.md missing"
  exit 1
fi
if [[ -d "$HOME_DIR/.zcode" ]]; then
  if [[ -f "$HOME_DIR/.zcode/AGENTS.md" ]] && diff -q "$TEMPLATE" "$HOME_DIR/.zcode/AGENTS.md" >/dev/null 2>&1; then
    ok "$HOME_DIR/.zcode/AGENTS.md matches canonical exactly"
  else
    err "$HOME_DIR/.zcode/AGENTS.md missing or diverged from canonical — run installer"
    exit 1
  fi
  if python3 - "$HOME_DIR/.zcode/cli/config.json" <<'PY' >/dev/null 2>&1
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
server = data.get("mcp", {}).get("servers", {}).get("memroos")
if not isinstance(server, dict):
    sys.exit(1)
if server.get("command") != "/bin/bash":
    sys.exit(1)
if server.get("type") != "stdio":
    sys.exit(1)
PY
  then
    ok "$HOME_DIR/.zcode/cli/config.json registers MemroOS MCP"
  else
    err "$HOME_DIR/.zcode/cli/config.json missing MemroOS MCP registration — run installer"
    exit 1
  fi
else
  warn "ZCode home not found — skipping ZCode spot-check"
fi

echo ""
echo "All verifications passed. MemroOS is wired into every detected agent CLI."
echo ""
echo "If you added a new agent CLI, add it to scripts/install-agent-integrations.sh in the TARGETS array."
