#!/bin/bash
# CFGDUR-03 regression tests for scripts/memroos-health-check.sh.
#
# A monitoring script that has only ever been observed passing is not known to
# work. These drive each failure branch by stubbing `docker` on PATH, so they
# run on any machine with no containers and no network.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK="$ROOT/scripts/memroos-health-check.sh"
PASS=0; FAIL=0

setup() {
  TMP=$(mktemp -d)
  mkdir -p "$TMP/bin" "$TMP/root" "$TMP/state"
  # Stub docker. Behavior is driven by files the test writes.
  cat > "$TMP/bin/docker" <<'STUB'
#!/bin/bash
case "$1" in
  exec)
    if [[ "$*" == *NEO4J_HTTP_URL* ]]; then cat "$STUB_DIR/neo4j_url" 2>/dev/null; exit 0; fi
    if [[ "$*" == *QDRANT_URL* ]];    then cat "$STUB_DIR/qdrant_url" 2>/dev/null; exit 0; fi
    if [[ "$*" == *QDRANT_API_KEY* ]];then echo "fake-key"; exit 0; fi
    if [[ "$*" == *better-sqlite3* ]];then cat "$STUB_DIR/counts" 2>/dev/null; exit 0; fi
    ;;
  logs) cat "$STUB_DIR/logs" 2>/dev/null; exit 0 ;;
  ps)   cat "$STUB_DIR/ps" 2>/dev/null; exit 0 ;;
esac
exit 0
STUB
  chmod +x "$TMP/bin/docker"
  # Stub curl so Qdrant reachability is decidable offline.
  cat > "$TMP/bin/curl" <<'STUB'
#!/bin/bash
[[ "$*" == *api.sendgrid.com* ]] && exit 0
cat "$STUB_DIR/qdrant_code" 2>/dev/null || echo 200
STUB
  chmod +x "$TMP/bin/curl"
  # Defaults: a healthy oracle-1-shaped host.
  echo "https://abc.databases.neo4j.io" > "$TMP/neo4j_url"
  echo "https://xyz.cloud.qdrant.io"    > "$TMP/qdrant_url"
  echo "200"                            > "$TMP/qdrant_code"
  echo "2 59"                           > "$TMP/counts"
  echo "[graph-catchup] ran"            > "$TMP/logs"
  echo "memroos-local-memroos-1"        > "$TMP/ps"
  cat > "$TMP/profile.env" <<'PROF'
MEMROOS_HOST_ID=test-host
EXPECT_GRAPH_BACKEND=aura
EXPECT_VECTOR_BACKEND=qdrant-cloud
EXPECT_LOCAL_NEO4J_RUNNING=no
CONTAINER_NAME=test-container
ALERT_EMAIL=
PROF
}

run_check() {
  STUB_DIR="$TMP" PATH="$TMP/bin:$PATH" \
  MEMROOS_ROOT="$TMP/root" MEMROOS_HEALTH_STATE_DIR="$TMP/state" \
  MEMROOS_HOST_PROFILE="$TMP/profile.env" \
  bash "$CHECK" >/dev/null 2>&1
  echo $?
}

assert() { # name expected_code
  local name="$1" want="$2" got; got=$(run_check)
  if [ "$got" = "$want" ]; then PASS=$((PASS+1)); echo "  ✓ $name"
  else FAIL=$((FAIL+1)); echo "  ✗ $name (expected exit $want, got $got)"; fi
  rm -rf "$TMP"
}

echo "CFGDUR-03 health-check branch tests:"

setup; assert "healthy host passes" 0

setup; echo "http://local-neo4j:7474" > "$TMP/neo4j_url"
assert "aura-profile host on local neo4j FAILS" 1

setup; echo "your-qdrant-cloud-endpoint" > "$TMP/qdrant_url"
assert "placeholder QDRANT_URL FAILS" 1

setup; echo "503" > "$TMP/qdrant_code"
assert "unreachable Qdrant FAILS" 1

setup; : > "$TMP/logs"
assert "silent graph-catchup FAILS" 1

setup; echo "0 0" > "$TMP/counts"
assert "empty users table FAILS" 1

setup; echo "2 59" > "$TMP/state/min_counts"; echo "2 40" > "$TMP/counts"
assert "agent count regression FAILS" 1

setup; echo "memroos-local-neo4j-1" >> "$TMP/ps"
assert "unexpected local neo4j running FAILS" 1

# A host that legitimately runs local Neo4j must PASS with a local profile —
# this is the cordant-hermes-01 case. A check hardcoded to Aura would alert
# here forever and get muted.
setup
echo "http://local-neo4j:7474" > "$TMP/neo4j_url"
echo "memroos-local-neo4j-1"  >> "$TMP/ps"
sed -i.bak 's/EXPECT_GRAPH_BACKEND=aura/EXPECT_GRAPH_BACKEND=local/; s/EXPECT_VECTOR_BACKEND=qdrant-cloud/EXPECT_VECTOR_BACKEND=none/; s/EXPECT_LOCAL_NEO4J_RUNNING=no/EXPECT_LOCAL_NEO4J_RUNNING=yes/' "$TMP/profile.env"
assert "local-profile host with local neo4j PASSES" 0

setup; rm -f "$TMP/profile.env"
assert "missing host profile FAILS" 1

echo ""
echo "  $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
