#!/usr/bin/env bash
# MemRoOS first-day onboarding verifier (ENTOPS-05 code slice)
# ==============================================================
#
# What a new hire runs after invite/install to confirm their machine
# can reach MemRoOS and has directives present.
#
# Usage:
#   bash scripts/verify-first-day-onboarding.sh           # operator mode checks
#   bash scripts/verify-first-day-onboarding.sh --local   # solo smoke (no live operator)
#
# Honest stubs (NOT verified here — see docs/entops-stub-handoff.md):
#   - Real IdP / OAuth device-flow login
#   - MDM packaging / locked-down Mac without admin
#   - S9 / S10 live demos
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMROOS_ROOT="${MEMROOS_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
HOME_DIR="${HOME:-$(eval echo "~$(whoami)")}"
MEMROOS_HOME="${MEMROOS_HOME:-$HOME_DIR/.memroos}"

LOCAL_MODE=0
for arg in "$@"; do
  case "$arg" in
    --local) LOCAL_MODE=1 ;;
    --help|-h)
      sed -n '2,20p' "$0"
      exit 0
      ;;
  esac
done

OPERATOR_URL="${MEMROOS_OPERATOR_URL:-${MEMROOS_APP_URL:-}}"
OPERATOR_URL="${OPERATOR_URL%/}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}PASS${NC}  $*"; }
warn() { echo -e "${YELLOW}WARN${NC}  $*"; }
fail() { echo -e "${RED}FAIL${NC}  $*"; FAILURES=$((FAILURES + 1)); }

FAILURES=0

echo "MemRoOS First-Day Onboarding Verifier"
echo "====================================="
echo "Repo:     $MEMROOS_ROOT"
echo "Home:     $MEMROOS_HOME"
echo "Mode:     $([[ "$LOCAL_MODE" -eq 1 ]] && echo local/solo || echo operator)"
echo ""

# ---- Checklist -------------------------------------------------------------

echo "Checklist"
echo "---------"

# 1) ~/.memroos env presence
ENV_HITS=0
if [[ -d "$MEMROOS_HOME" ]]; then
  shopt -s nullglob
  for f in "$MEMROOS_HOME"/*.env "$MEMROOS_HOME"/agent-env; do
    [[ -f "$f" ]] || continue
    ENV_HITS=$((ENV_HITS + 1))
  done
  shopt -u nullglob
fi
if [[ "$ENV_HITS" -gt 0 ]]; then
  ok "~/.memroos env present ($ENV_HITS file(s))"
else
  if [[ "$LOCAL_MODE" -eq 1 ]]; then
    warn "~/.memroos/*.env missing (solo ok if you have not onboarded yet)"
  else
    fail "~/.memroos/*.env (or agent-env) missing — run onboarding/invite first"
  fi
fi

# 2) MCP launcher / stub present
if [[ "$LOCAL_MODE" -eq 1 ]]; then
  if [[ -x "$MEMROOS_ROOT/scripts/memroos-mcp.sh" ]]; then
    ok "local MCP launcher executable"
  else
    fail "scripts/memroos-mcp.sh missing or not executable"
  fi
else
  if [[ -x "$MEMROOS_ROOT/scripts/memroos-operator-stub.sh" ]]; then
    ok "operator-stub launcher executable"
  else
    fail "scripts/memroos-operator-stub.sh missing or not executable"
  fi
fi

# 3) Operator URL reachable (skipped in --local unless URL set)
if [[ "$LOCAL_MODE" -eq 1 && -z "$OPERATOR_URL" ]]; then
  ok "operator URL check skipped (--local)"
elif [[ -z "$OPERATOR_URL" ]]; then
  fail "MEMROOS_OPERATOR_URL / MEMROOS_APP_URL not set"
else
  if command -v curl >/dev/null 2>&1; then
    if curl -sS -m 8 -o /dev/null -w "" "$OPERATOR_URL/" 2>/dev/null \
      || curl -sS -m 8 -o /dev/null -w "" "$OPERATOR_URL/api/health" 2>/dev/null; then
      ok "operator reachable at $OPERATOR_URL"
    else
      fail "operator not reachable at $OPERATOR_URL"
    fi
  else
    fail "curl required to probe operator URL"
  fi
fi

# 4) Directives present (canonical template + at least one agent AGENTS.md)
TEMPLATE="$MEMROOS_ROOT/agents/AGENTS_TEMPLATE.md"
if [[ -f "$TEMPLATE" ]]; then
  ok "canonical AGENTS_TEMPLATE.md present ($(wc -l < "$TEMPLATE" | tr -d ' ') lines)"
else
  fail "agents/AGENTS_TEMPLATE.md missing"
fi

DIRECTIVE_HIT=0
for candidate in \
  "$HOME_DIR/.codex/AGENTS.md" \
  "$HOME_DIR/.claude/CLAUDE.md" \
  "$HOME_DIR/.hermes/AGENTS.md" \
  "$HOME_DIR/.qwen/QWEN.md"; do
  if [[ -f "$candidate" ]]; then
    DIRECTIVE_HIT=$((DIRECTIVE_HIT + 1))
  fi
done
if [[ "$DIRECTIVE_HIT" -gt 0 ]]; then
  ok "agent directive file(s) present ($DIRECTIVE_HIT)"
else
  if [[ "$LOCAL_MODE" -eq 1 ]]; then
    warn "no installed agent AGENTS.md yet — run: bash scripts/install-agent-integrations.sh --local"
  else
    fail "no installed agent AGENTS.md — run install-agent-integrations.sh (operator mode)"
  fi
fi

# 5) knowledge_read smoke (best-effort)
echo ""
echo "knowledge_read smoke"
echo "--------------------"
SMOKE_OK=0
if [[ "$LOCAL_MODE" -eq 1 ]]; then
  # Solo: confirm knowledge-mcp package is importable / server module exists.
  if [[ -f "$MEMROOS_ROOT/services/knowledge-mcp/server.py" ]] \
    || [[ -f "$MEMROOS_ROOT/services/knowledge-mcp/src/server.py" ]]; then
    ok "knowledge-mcp server module present (local smoke)"
    SMOKE_OK=1
  else
    # Prefer listing package root
    if [[ -d "$MEMROOS_ROOT/services/knowledge-mcp" ]]; then
      ok "knowledge-mcp package directory present (local smoke)"
      SMOKE_OK=1
    else
      fail "knowledge-mcp package missing under services/"
    fi
  fi
else
  if [[ -n "$OPERATOR_URL" ]] && command -v curl >/dev/null 2>&1; then
    AUTH=()
    if [[ -n "${MEMROOS_AGENT_API_KEY:-}" ]]; then
      AUTH=(-H "Authorization: Bearer ${MEMROOS_AGENT_API_KEY}")
    fi
    # Probe a cheap authenticated or public health surface; knowledge tool
    # requires a live MCP session which we cannot fully open here.
    if curl -sS -m 8 "${AUTH[@]}" -o /dev/null -w "" "$OPERATOR_URL/api/health" 2>/dev/null \
      || curl -sS -m 8 "${AUTH[@]}" -o /dev/null -w "" "$OPERATOR_URL/" 2>/dev/null; then
      ok "operator health probe succeeded (knowledge_read requires live MCP session)"
      SMOKE_OK=1
    else
      fail "operator health probe failed — knowledge_read would not work"
    fi
  else
    fail "cannot smoke knowledge_read without OPERATOR_URL + curl"
  fi
fi

# ---- Summary ---------------------------------------------------------------
echo ""
echo "Summary"
echo "-------"
if [[ "$FAILURES" -eq 0 ]]; then
  ok "First-day onboarding checks passed"
  echo ""
  echo "Still NOT built (see docs/entops-stub-handoff.md): IdP/OAuth, MDM pkg, S9/S10 demos."
  exit 0
fi

fail "$FAILURES check(s) failed — fix items marked FAIL above"
exit 1
