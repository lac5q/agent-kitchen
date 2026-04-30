#!/bin/bash
# ~/github/knowledge/mem0-export.sh
# Export yesterday's mem0 memories to markdown files in mem0-exports/
# Called by knowledge-curator.sh as Step 3
# mem0 REST API: GET /memory/all?agent_id={uid} returns all memories (no server-side date filter)
# Client-side filter: created_at starts with YYYY-MM-DD (ISO8601 prefix match)

MEM0_URL="http://localhost:3201"
EXPORT_DIR="$HOME/github/knowledge/mem0-exports"

# macOS uses date -v-1d; Linux uses date -d yesterday
YESTERDAY=$(date -v-1d '+%Y-%m-%d' 2>/dev/null || date -d 'yesterday' '+%Y-%m-%d')

mkdir -p "$EXPORT_DIR"

# All 17 known user_ids (discovered via Qdrant agent_memory scroll — no discovery API in mem0)
USER_IDS=(
    shared
    ceo
    cto
    cmo
    chief_of_staff
    engineer-handdrawn
    seo-handdrawn
    growth-handdrawn
    popsmiths
    social-media-manager
    copywriter
    video-producer
    graphic-designer
    growth-strategist
    qwen
    qwen-engineer
    claude
)

exported=0
skipped=0
empty=0

for uid in "${USER_IDS[@]}"; do
    OUTFILE="$EXPORT_DIR/${uid}-${YESTERDAY}.md"

    # Idempotent: skip if already exported today
    if [ -f "$OUTFILE" ]; then
        skipped=$((skipped + 1))
        continue
    fi

    # Fetch memories and filter to yesterday's entries
    curl -sf "$MEM0_URL/memory/all?agent_id=$uid" 2>/dev/null | python3 -c "
import json, sys

data = json.load(sys.stdin)
mems = data.get('memories', [])
yesterday = sys.argv[1]

# Filter to memories created yesterday (prefix match on ISO8601 date)
filtered = [m for m in mems if m.get('created_at', '').startswith(yesterday)]

if not filtered:
    sys.exit(0)

uid = sys.argv[2]
print(f'# mem0 Highlights: {uid} — {yesterday}')
print()
for m in filtered:
    ts = m['created_at'][:16]
    text = m['memory']
    print(f'- [{ts}] {text}')
" "$YESTERDAY" "$uid" > "$OUTFILE" 2>/dev/null

    exit_code=$?
    if [ $exit_code -ne 0 ] || [ ! -s "$OUTFILE" ]; then
        # No memories for this user yesterday, or curl/python failed
        rm -f "$OUTFILE"
        empty=$((empty + 1))
    else
        exported=$((exported + 1))
        echo "  Exported: $OUTFILE"
    fi
done

echo "  mem0 export complete: $exported files written, $skipped already existed, $empty had no memories for $YESTERDAY"
