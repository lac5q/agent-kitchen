#!/bin/bash
# Backfill Mem0 from all existing knowledge sources
# Sources: Claude Code memory files, PMO LESSONS.md, PENDING_FACTS.md, knowledge shared docs
# Safe to re-run — Mem0 deduplicates by content hash

set -uo pipefail

MEM0_URL="${MEM0_URL:-http://localhost:3201}"
DRY_RUN="${DRY_RUN:-0}"
TOTAL=0
SKIPPED=0

log() { echo "[$(date +%H:%M:%S)] $1"; }

# Check Mem0 is up
if ! rtk proxy curl -s "$MEM0_URL/health" | grep -q '"ok"'; then
  echo "ERROR: Mem0 not running at $MEM0_URL — start it first"
  exit 1
fi
log "Mem0 is up. Starting backfill..."

add_memory() {
  local text="$1"
  local agent_id="${2:-shared}"
  local metadata="${3:-{}}"

  if [ -z "$text" ] || [ ${#text} -lt 10 ]; then
    SKIPPED=$((SKIPPED + 1))
    return
  fi

  if [ "$DRY_RUN" = "1" ]; then
    echo "  [DRY] [$agent_id] $(echo "$text" | cut -c1-100)"
    TOTAL=$((TOTAL + 1))
    return
  fi

  local payload
  payload=$(python3 -c "
import json, sys
data = {'text': sys.argv[1], 'agent_id': sys.argv[2]}
try:
    data['metadata'] = json.loads(sys.argv[3])
except:
    pass
print(json.dumps(data))
" "$text" "$agent_id" "$metadata" 2>/dev/null)

  if [ -z "$payload" ]; then
    SKIPPED=$((SKIPPED + 1))
    return
  fi

  local result
  result=$(rtk proxy curl -s -X POST "$MEM0_URL/memory/add" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>/dev/null)

  if echo "$result" | grep -q '"status"'; then
    TOTAL=$((TOTAL + 1))
  else
    log "  WARN: $(echo "$text" | cut -c1-60) → $result"
    SKIPPED=$((SKIPPED + 1))
  fi
}

add_memory_file() {
  local file="$1"
  local agent_id="${2:-shared}"
  local source_label="${3:-$file}"

  if [ ! -f "$file" ]; then return; fi

  log "  Reading: $source_label"

  # Read frontmatter type if present
  local mem_type
  mem_type=$(grep -m1 "^type:" "$file" 2>/dev/null | sed 's/type: *//' | tr -d '"' || echo "memory")

  # Skip MEMORY.md index files
  if [[ "$file" == *"/MEMORY.md" ]]; then return; fi

  # Extract content after frontmatter (skip --- blocks)
  local content
  content=$(awk '/^---/{if(++c==2)skip=0; next} c<2{skip=1} !skip' "$file" 2>/dev/null || cat "$file")

  # Split into meaningful chunks (paragraphs or bullet points)
  while IFS= read -r line; do
    # Skip empty lines, headers, code fences
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^#+ ]] && continue
    [[ "$line" =~ ^\`\`\` ]] && continue
    [[ "$line" =~ ^--- ]] && continue
    [[ "$line" =~ ^\*\*Why:\*\* ]] && continue

    # Clean up markdown
    clean=$(echo "$line" | sed 's/^\s*[-*]\s*//' | sed 's/\*\*//g' | sed "s/\`//g")
    [[ ${#clean} -lt 15 ]] && continue

    add_memory "$clean" "$agent_id" "{\"source\": \"$(basename "$file")\", \"type\": \"$mem_type\"}"
  done <<< "$content"
}

# ── Source 1: Claude Code memory files ──────────────────────────────────────
log "=== Source 1: Claude Code memory files ==="
MEMORY_BASE="$HOME/.claude/projects"

# paperclip project (skip env/credentials files)
for f in "$MEMORY_BASE/-Users-lcalderon-github-paperclip/memory/"*.md; do
  fname=$(basename "$f")
  [[ "$fname" == *"env"* || "$fname" == *"key"* || "$fname" == *"secret"* || "$fname" == *"cred"* ]] && continue
  add_memory_file "$f" "claude-code" "paperclip/$fname"
done

# popsmiths project
for f in "$MEMORY_BASE/-Users-lcalderon-github-popsmiths-app/memory/"*.md; do
  add_memory_file "$f" "claude-code" "popsmiths/$(basename $f)"
done

# sketchpop project
for f in "$MEMORY_BASE/-Users-lcalderon-github-sketchpop-art-app/memory/"*.md; do
  add_memory_file "$f" "claude-code" "sketchpop/$(basename $f)"
done

# home project (video rules, feedback)
for f in "$MEMORY_BASE/-Users-lcalderon/memory/"*.md; do
  add_memory_file "$f" "claude-code" "home/$(basename $f)"
done

# ── Source 2: PMO Agent LESSONS.md files ────────────────────────────────────
log "=== Source 2: PMO Agent LESSONS.md ==="
PMO_BASE="$HOME/github/PMO/agents"
for agent_dir in "$PMO_BASE"/*/; do
  agent_id=$(basename "$agent_dir")
  lessons="$agent_dir/LESSONS.md"
  if [ -f "$lessons" ]; then
    add_memory_file "$lessons" "$agent_id" "PMO/$agent_id/LESSONS.md"
  fi
done

# ── Source 3: PENDING_FACTS.md ──────────────────────────────────────────────
log "=== Source 3: PENDING_FACTS.md ==="
PENDING="$HOME/github/knowledge/shared/PENDING_FACTS.md"
if [ -f "$PENDING" ]; then
  while IFS= read -r line; do
    # Parse entries: - [date] [agent] [category] fact
    if [[ "$line" =~ ^\-[[:space:]]\[ ]]; then
      # Extract agent_id: second bracketed value
      agent_tag=$(echo "$line" | python3 -c "
import sys, re
line = sys.stdin.read().strip()
matches = re.findall(r'\[([^\]]+)\]', line)
print(matches[1] if len(matches) > 1 else 'shared')
" 2>/dev/null || echo "shared")
      # Strip all bracket tags from the fact text
      clean=$(echo "$line" | python3 -c "
import sys, re
line = sys.stdin.read().strip()
line = re.sub(r'^-\s*', '', line)
line = re.sub(r'\[[^\]]+\]\s*', '', line).strip()
print(line)
" 2>/dev/null)
      [[ ${#clean} -lt 15 ]] && continue
      add_memory "$clean" "${agent_tag:-shared}" '{"source":"PENDING_FACTS"}'
    fi
  done < "$PENDING"
fi

# ── Source 4: Shared knowledge docs ─────────────────────────────────────────
log "=== Source 4: Shared knowledge docs ==="
for f in "$HOME/github/knowledge/shared/COMPANY_FACTS.md" \
         "$HOME/github/knowledge/shared/CURRENT_PRIORITIES.md" \
         "$HOME/github/knowledge/shared/LEARNING_PROTOCOL.md"; do
  add_memory_file "$f" "shared" "knowledge/shared/$(basename $f)"
done

# ── Source 5: PMO Agent AGENTS.md (roles and capabilities) ──────────────────
log "=== Source 5: PMO Agent AGENTS.md ==="
for agent_dir in "$PMO_BASE"/*/; do
  agent_id=$(basename "$agent_dir")
  agents_file="$agent_dir/AGENTS.md"
  if [ -f "$agents_file" ]; then
    add_memory_file "$agents_file" "$agent_id" "PMO/$agent_id/AGENTS.md"
  fi
done

# ── Source 6: Cursor plans (rich task context) ───────────────────────────────
log "=== Source 6: Cursor plans ==="
CURSOR_PLANS="$HOME/.cursor/plans"
if [ -d "$CURSOR_PLANS" ]; then
  for f in "$CURSOR_PLANS"/*.md; do
    [ -f "$f" ] || continue
    fname=$(basename "$f" .plan.md)
    # Extract just the summary/goal lines (avoid huge plan bodies)
    summary=$(head -20 "$f" | grep -E "^#+|^Goal|^Summary|^Objective" | head -5)
    if [ -n "$summary" ]; then
      add_memory "Cursor plan: $fname — $summary" "cursor" '{"source":"cursor-plans"}'
    fi
    # Also grab any 'Learnings' or 'Notes' sections
    learnings=$(awk '/^#+.*[Ll]earning|^#+.*[Nn]otes/{found=1; next} found && /^#/{found=0} found{print}' "$f" 2>/dev/null | head -20)
    if [ -n "$learnings" ]; then
      while IFS= read -r line; do
        clean=$(echo "$line" | sed 's/^\s*[-*]\s*//' | sed 's/\*\*//g')
        [[ ${#clean} -lt 15 ]] && continue
        add_memory "$clean" "cursor" '{"source":"cursor-plans-learnings"}'
      done <<< "$learnings"
    fi
  done
fi

# ── Source 7: Cursor project memories ────────────────────────────────────────
log "=== Source 7: Cursor project memories ==="
CURSOR_PROJECTS="$HOME/.cursor/projects"
# Only process .md files (not binary/json/db)
find "$CURSOR_PROJECTS" -name "*.md" -not -name "MEMORY.md" 2>/dev/null | while read -r f; do
  project_name=$(echo "$f" | sed "s|$CURSOR_PROJECTS/||" | cut -d'/' -f1 | sed 's/Users-lcalderon-//' | sed 's/Documents-GitHub-//' | sed 's/github-//')
  add_memory_file "$f" "cursor" "cursor/$project_name/$(basename $f)"
done

# ── Done ─────────────────────────────────────────────────────────────────────
log "=== Backfill complete ==="
log "Added: $TOTAL memories | Skipped: $SKIPPED"
log "Verify: rtk proxy curl -s \"$MEM0_URL/memory/all?agent_id=shared\" | python3 -c \"import json,sys; d=json.load(sys.stdin); print(len(d.get('memories',d.get('results',[]))),'memories')\""
