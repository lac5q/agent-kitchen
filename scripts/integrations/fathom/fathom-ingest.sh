#!/usr/bin/env bash
# Provider-agnostic meet-recordings entrypoint for Fathom (dual-account).
# Wired via MEETINGS_INGEST_COMMAND in ~/.memroos/memroos-runtime.env.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMROOS_ROOT="${MEMROOS_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
OUTPUT_DIR="${FATHOM_OUTPUT_DIR:-$MEMROOS_ROOT/data/context/meet-recordings}"
ACCOUNTS_CONFIG="${FATHOM_ACCOUNTS_CONFIG:-$HOME/.memroos/integrations/fathom-accounts.json}"

mkdir -p "$OUTPUT_DIR"

exec python3 "$SCRIPT_DIR/fathom_ingest.py" \
  --accounts-config "$ACCOUNTS_CONFIG" \
  --output-dir "$OUTPUT_DIR" \
  "$@"
