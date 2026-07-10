#!/usr/bin/env bash
# restore-drill.sh — Idempotent kernel + orchestration DB restore drill.
#
# Phase 147 — FLEET-23/FLEET-24: Kernel durability restore drill.
#
# This script:
#   1. Copies the kernel SQLite DB to a temp location (consistent backup via
#      sqlite3 .backup, which is read-only on the source).
#   2. Creates a restore copy from the backup (simulates restoring from a
#      litestream replica or file backup).
#   3. Verifies the restored DB: PRAGMA integrity_check, counts registered
#      agents, counts audit entries (audit_log + audit_entries).
#   4. Tests the orchestration DB if it exists (or skips with a note).
#   5. Logs all steps to stdout and a log file.
#
# CRITICAL: This script NEVER touches the production DB. It works on copies
# only. The sqlite3 .backup command is read-only on the source DB.
#
# No real secrets are used — any credentials are placeholders or env-var
# references.
#
# Usage:
#   bash scripts/restore-drill.sh
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Config ───────────────────────────────────────────────────────────────
# Kernel DB: check env var, then default paths.
KERNEL_DB_CANDIDATES=()
if [[ -n "${SQLITE_DB_PATH:-}" ]]; then
  if [[ "${SQLITE_DB_PATH}" = /* ]]; then
    KERNEL_DB_CANDIDATES+=("${SQLITE_DB_PATH}")
  else
    KERNEL_DB_CANDIDATES+=("${REPO_ROOT}/${SQLITE_DB_PATH}")
  fi
fi
KERNEL_DB_CANDIDATES+=("${REPO_ROOT}/data/conversations.db")
KERNEL_DB_CANDIDATES+=("${REPO_ROOT}/apps/memroos/data/conversations.db")

# Orchestration DB: check env var, then default path.
ORCH_DB_CANDIDATES=()
if [[ -n "${ORCHESTRATION_DB_PATH:-}" ]]; then
  if [[ "${ORCHESTRATION_DB_PATH}" = /* ]]; then
    ORCH_DB_CANDIDATES+=("${ORCHESTRATION_DB_PATH}")
  else
    ORCH_DB_CANDIDATES+=("${REPO_ROOT}/${ORCHESTRATION_DB_PATH}")
  fi
fi
ORCH_DB_CANDIDATES+=("${REPO_ROOT}/data/orchestration.db")

# Temp working directory.
DRILL_TMPDIR="${TMPDIR:-/tmp}/memroos-restore-drill-$$"
LOG_FILE="${DRILL_TMPDIR}/restore-drill.log"

# ── Helpers ──────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[INFO]${NC}  $*" | tee -a "${LOG_FILE}"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*" | tee -a "${LOG_FILE}"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*" | tee -a "${LOG_FILE}"; }
err()   { echo -e "${RED}[ERROR]${NC} $*" | tee -a "${LOG_FILE}" >&2; }

FAILURES=0
fail()  { err "$*"; FAILURES=$((FAILURES + 1)); }

# ── Setup ────────────────────────────────────────────────────────────────
mkdir -p "${DRILL_TMPDIR}"
echo "MemroOS Restore Drill — $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${LOG_FILE}"
echo "Working directory: ${DRILL_TMPDIR}" >> "${LOG_FILE}"
echo "" >> "${LOG_FILE}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Required command not found: $1"
    exit 1
  fi
}

require_cmd sqlite3

# ── Resolve kernel DB path ───────────────────────────────────────────────
resolve_kernel_db() {
  for candidate in "${KERNEL_DB_CANDIDATES[@]}"; do
    if [[ -f "${candidate}" && -s "${candidate}" ]]; then
      printf '%s' "${candidate}"
      return 0
    fi
  done
  return 1
}

# ── Create minimal test DB (for fresh checkouts with no kernel DB) ───────
create_minimal_test_db() {
  local test_db="$1"
  info "Creating minimal test DB at ${test_db} (no production DB found)"
  sqlite3 "${test_db}" <<'SQL'
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS registered_agents (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  role              TEXT NOT NULL,
  platform          TEXT NOT NULL,
  protocol          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'dormant',
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id    TEXT,
  event_type  TEXT NOT NULL,
  timestamp   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  metadata    TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS audit_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type  TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  tenant_id   TEXT NOT NULL DEFAULT 'default-tenant',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  metadata    TEXT NOT NULL DEFAULT '{}'
);

-- Insert minimal test data
INSERT INTO registered_agents (id, name, role, platform, protocol)
VALUES ('test-agent-001', 'Test Agent', 'research', 'hermes', 'a2a');

INSERT INTO audit_log (agent_id, event_type)
VALUES ('test-agent-001', 'restore_drill_test');

INSERT INTO audit_entries (event_type, entity_type, entity_id)
VALUES ('restore_drill_test', 'test', 'test-001');
SQL
  ok "Minimal test DB created with 1 agent, 1 audit_log entry, 1 audit_entries entry"
}

# ── Drill a single DB ────────────────────────────────────────────────────
# Args: $1 = label, $2 = source DB path
drill_db() {
  local label="$1"
  local source_db="$2"
  local backup_db="${DRILL_TMPDIR}/${label}-backup.db"
  local restore_db="${DRILL_TMPDIR}/${label}-restore.db"

  info "=== ${label} Restore Drill ==="
  info "Source DB: ${source_db}"
  info "Source size: $(du -h "${source_db}" | cut -f1)"

  # Step 1: Backup (read-only on source via sqlite3 .backup)
  info "Step 1: Creating consistent backup via sqlite3 .backup (read-only on source)"
  if sqlite3 "${source_db}" ".backup '${backup_db}'" 2>>"${LOG_FILE}"; then
    ok "Backup created: ${backup_db} ($(du -h "${backup_db}" | cut -f1))"
  else
    fail "Backup failed for ${label}"
    return 1
  fi

  # Step 2: Restore (copy backup to restore location)
  info "Step 2: Creating restore copy from backup"
  if cp "${backup_db}" "${restore_db}" 2>>"${LOG_FILE}"; then
    ok "Restore copy created: ${restore_db} ($(du -h "${restore_db}" | cut -f1))"
  else
    fail "Restore copy failed for ${label}"
    return 1
  fi

  # Step 3: Verify integrity
  info "Step 3: Verifying restored DB integrity"
  local integrity_result
  integrity_result=$(sqlite3 "${restore_db}" "PRAGMA integrity_check;" 2>>"${LOG_FILE}")
  if [[ "${integrity_result}" == "ok" ]]; then
    ok "PRAGMA integrity_check: ${integrity_result}"
  else
    fail "PRAGMA integrity_check FAILED: ${integrity_result}"
    return 1
  fi

  # Step 4: Count registered agents
  info "Step 4: Counting registered agents"
  local agent_count
  agent_count=$(sqlite3 "${restore_db}" "SELECT COUNT(*) FROM registered_agents;" 2>>"${LOG_FILE}" || echo "N/A")
  if [[ "${agent_count}" == "N/A" ]]; then
    warn "registered_agents table not found or query failed"
  else
    ok "Registered agents: ${agent_count}"
  fi

  # Step 5: Count audit entries (audit_log)
  info "Step 5: Counting audit_log entries"
  local audit_log_count
  audit_log_count=$(sqlite3 "${restore_db}" "SELECT COUNT(*) FROM audit_log;" 2>>"${LOG_FILE}" || echo "N/A")
  if [[ "${audit_log_count}" == "N/A" ]]; then
    warn "audit_log table not found or query failed"
  else
    ok "audit_log entries: ${audit_log_count}"
  fi

  # Step 6: Count audit entries (audit_entries — POLGOV receipt table)
  info "Step 6: Counting audit_entries (POLGOV receipts)"
  local audit_entries_count
  audit_entries_count=$(sqlite3 "${restore_db}" "SELECT COUNT(*) FROM audit_entries;" 2>>"${LOG_FILE}" || echo "N/A")
  if [[ "${audit_entries_count}" == "N/A" ]]; then
    warn "audit_entries table not found or query failed"
  else
    ok "audit_entries: ${audit_entries_count}"
  fi

  # Step 7: Verify schema version
  info "Step 7: Checking schema version"
  local schema_version
  schema_version=$(sqlite3 "${restore_db}" "PRAGMA user_version;" 2>>"${LOG_FILE}" || echo "N/A")
  if [[ "${schema_version}" == "N/A" ]]; then
    warn "Could not read PRAGMA user_version"
  else
    ok "Schema version (PRAGMA user_version): ${schema_version}"
  fi

  # Step 8: List table count
  info "Step 8: Counting total tables"
  local table_count
  table_count=$(sqlite3 "${restore_db}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';" 2>>"${LOG_FILE}" || echo "N/A")
  if [[ "${table_count}" == "N/A" ]]; then
    warn "Could not count tables"
  else
    ok "Total tables: ${table_count}"
  fi

  info "=== ${label} drill complete ==="
  echo "" | tee -a "${LOG_FILE}"
}

# ── Resolve orchestration DB path ────────────────────────────────────────
resolve_orch_db() {
  for candidate in "${ORCH_DB_CANDIDATES[@]}"; do
    if [[ -f "${candidate}" && -s "${candidate}" ]]; then
      printf '%s' "${candidate}"
      return 0
    fi
  done
  return 1
}

# ── Main ─────────────────────────────────────────────────────────────────
main() {
  info "MemroOS Restore Drill started"
  info "Repo root: ${REPO_ROOT}"
  info "Temp dir: ${DRILL_TMPDIR}"
  echo "" | tee -a "${LOG_FILE}"

  # ── Kernel DB drill ──────────────────────────────────────────────────
  local kernel_db
  kernel_db=$(resolve_kernel_db 2>/dev/null || true)

  if [[ -z "${kernel_db}" ]]; then
    warn "No kernel DB found at default paths. Creating minimal test DB for drill."
    kernel_db="${DRILL_TMPDIR}/kernel-test.db"
    create_minimal_test_db "${kernel_db}"
    echo "" | tee -a "${LOG_FILE}"
  else
    ok "Found kernel DB: ${kernel_db}"
  fi

  drill_db "kernel" "${kernel_db}"

  # ── Orchestration DB drill ───────────────────────────────────────────
  local orch_db
  orch_db=$(resolve_orch_db 2>/dev/null || true)

  if [[ -z "${orch_db}" ]]; then
    info "=== Orchestration DB ==="
    warn "No orchestration DB found at default paths (data/orchestration.db)."
    info "This is expected when the LangGraph orchestration service is not running."
    info "The orchestration DB is created on first startup of the Python service."
    info "Litestream replication config is at: services/orchestration/litestream.yml.example"
    info "See docs/integrations/langgraph.md → 'Checkpoint Durability' for restore steps."
    info "=== Orchestration DB drill skipped ==="
    echo "" | tee -a "${LOG_FILE}"
  else
    ok "Found orchestration DB: ${orch_db}"
    drill_db "orchestration" "${orch_db}"
  fi

  # ── Summary ──────────────────────────────────────────────────────────
  info "=== Restore Drill Summary ==="
  if [[ "${FAILURES}" -eq 0 ]]; then
    ok "All checks PASSED (0 failures)"
    ok "Log file: ${LOG_FILE}"
    info "Drill temp directory (will be cleaned up): ${DRILL_TMPDIR}"
  else
    err "Restore drill completed with ${FAILURES} failure(s)"
    err "Log file: ${LOG_FILE}"
  fi

  # Clean up temp files (optional — keep for inspection)
  info "Temp files retained at: ${DRILL_TMPDIR}"
  info "To clean up: rm -rf ${DRILL_TMPDIR}"

  exit "${FAILURES}"
}

main "$@"
