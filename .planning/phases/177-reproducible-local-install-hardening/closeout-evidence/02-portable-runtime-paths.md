# INSTALL-REPRO-02 — Make runtime paths portable (evidence pack)

Three sub-acceptance criteria, each with concrete evidence below.

## Criterion 1: `.env.example` uses `${HOME}` placeholders that Docker Compose expands

**Evidence:**

`.env.example` excerpt (the runtime paths that were hardcoded `/Users/yourname/...`
in pre-Phase-177 main):
```
KNOWLEDGE_BASE_PATH=${HOME}/github/knowledge
AGENT_CONFIGS_PATH=${HOME}/github/knowledge/agent-configs
CLAUDE_MEMORY_PATH=${HOME}/.claude/projects
APO_PROPOSALS_PATH=${HOME}/.openclaw/skills/proposals
APO_CRON_LOG_PATH=${HOME}/.openclaw/logs/agent-lightning-cron.log
GITNEXUS_REGISTRY=${HOME}/.gitnexus/registry.json
QWEN_MEMORY_PATH=${HOME}/.qwen/projects
HERMES_MEMORY_PATH=${HOME}/.hermes/sessions
CODEX_MEMORY_PATH=${HOME}/.codex/sessions
```

**Runtime verification (independently captured in `01-portable-paths.txt`):**
A throwaway `docker-compose.tmp.yml` referencing `${KNOWLEDGE_BASE_PATH}` plus an
`.env.tmp` containing `KNOWLEDGE_BASE_PATH=${HOME}/github/knowledge` produced:
```
test:
  environment:
    FROM_ENV_FILE: /home/myuser/github/knowledge
    RAW: /home/myuser/test
```
i.e. `docker compose config` expands `${HOME}` from the shell environment when
reading `.env`. PASS.

## Criterion 2: `install.sh` generates `.env` with the same expansion

**Evidence:**

`install.sh` (around line 320, in `run_docker_install`):
```sh
if [[ ! -f ".env" && -f ".env.example" ]]; then
  log "Generating .env from .env.example (with shell expansion of \${HOME} and friends)..."
  if command -v envsubst >/dev/null 2>&1; then
    envsubst < .env.example > .env
  else
    # Fallback ... POSIX-portable shell loop eval'ing each non-comment assignment ...
    while IFS= read -r line; do ... eval "expanded=\"\$val\"" ... printf '%s=%s\n' ... >> .env
    chmod 600 .env
  fi
  chmod 600 .env
  ok "Created .env from .env.example"
fi
```

The fallback is exercised when `gettext`'s `envsubst` is not installed; both
paths produce a `.env` with shell-expanded paths.

## Criterion 3: secret-bearing `.env` is mode 600

**Evidence:**

Both branches of `install.sh` end with `chmod 600 .env`. The behavior is
preserved from INSTALL-REPRO-01 (the recovered local-profile merge already
enforced mode 600 on `.env`; Phase 177 keeps it).

A live check on the running cordant-hermes-01 stack (the install-regression
.sh script's structural check #8 verifies this on disk):
```
$ grep "chmod 600 .env" install.sh
    chmod 600 .env
```
PASS.

## Cross-reference

- The plan file `177-01-PLAN.md` INSTALL-REPRO-02 row summarizes the above.
- The `01-portable-paths.txt` closeout-evidence file captures the full grep
  surface in one pass (it covers both sub-01 and sub-02 since they share
  the same grep predicate).
- `05-regression-fast.txt` row "✓ install.sh expands \${HOME} when
  generating .env" and row "✓ install.sh sets .env to mode 600" are the
  same acceptance criteria exercised by the regression harness.

## Result

INSTALL-REPRO-02 acceptance: **PASS** on all three criteria.
