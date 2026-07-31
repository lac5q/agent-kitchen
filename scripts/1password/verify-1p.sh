#!/bin/bash
echo "=== main-mac final verification ==="
if [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
  echo "OP_TOKEN: UNSET"
else
  echo "OP_TOKEN: SET (length=${#OP_SERVICE_ACCOUNT_TOKEN})"
fi
echo
echo "op whoami:"
op whoami 2>&1 | head -3
echo
echo "vaults:"
op vault list --format=json 2>/dev/null | python3 -c "
import sys, json
vs = json.loads(sys.stdin.read() or '[]')
print([v['name'] for v in vs])
"
echo
echo "read first item title from AgentWritable:"
ITEM=$(op item list --vault AgentWritable --format=json 2>/dev/null | python3 -c "import sys, json; items = json.loads(sys.stdin.read() or '[]'); print(items[0]['id'] if items else 'NO_ITEMS')")
if [ "$ITEM" != "NO_ITEMS" ]; then
  op read "op://AgentWritable/$ITEM/title" 2>&1 | head -1
fi
