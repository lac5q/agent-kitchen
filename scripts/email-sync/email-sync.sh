#!/usr/bin/env bash
# MemRoOS email-sync skeleton (v8.12 Phase 157 / Slice D)
# Private lane twin of meet-sync. Disabled by default until ACL proofs pass.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONFIG="${MEMROOS_EMAIL_SOURCES:-$HOME/.memroos/email-sources.json}"
OUT_BASE="${MEMROOS_EMAIL_OUT:-$ROOT/data/context/emails}"

usage() {
  cat <<'EOF'
Usage: scripts/email-sync/email-sync.sh [--health|--dry-run|--help]

Disabled by default. Enable only after owner ACL + classification proofs pass.
Writes labeled markdown under data/context/emails/<owner>/ when configured.
EOF
}

cmd="${1:-}"
case "$cmd" in
  --help|-h)
    usage
    exit 0
    ;;
  --health)
    echo "email-sync: health"
    echo "enabled: false (default)"
    echo "config: $CONFIG"
    echo "out_base: $OUT_BASE"
    if [[ -f "$CONFIG" ]]; then
      echo "config_present: true"
    else
      echo "config_present: false"
    fi
    echo "status: disabled_pending_acl_proof"
    exit 0
    ;;
  --dry-run)
    echo "email-sync: dry-run"
    echo "Would ingest into $OUT_BASE/<owner_user_id>/"
    echo "Frontmatter contract: owner_user_id, visibility, domain, sensitivity, policy, confidential_label, pii_protected"
    echo "Blocked: live ingest while GMAIL_INGEST_ENABLED is unset/false"
    exit 0
    ;;
  "")
    echo "email-sync: refusing to ingest (disabled by default). Use --health or --dry-run." >&2
    echo "Set GMAIL_INGEST_ENABLED=1 only after Phase 154/155 proofs and private lane review." >&2
    exit 2
    ;;
  *)
    echo "email-sync: unknown command: $cmd" >&2
    usage >&2
    exit 2
    ;;
esac
