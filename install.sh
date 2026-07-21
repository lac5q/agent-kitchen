#!/usr/bin/env bash
# MemroOS Installer — one command, progressive setup
# Usage: curl -fsSL https://raw.githubusercontent.com/lac5q/memroos/main/install.sh | bash
# Docs:   https://memroos.com
#
# This script:
# 1. Detects OS and prerequisites
# 2. Installs missing dependencies (with user approval)
# 3. Clones MemroOS
# 4. Offers local (default, full self-hosted stack), demo, or full setup
# 5. Shows status on completion

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Config
MEMROOS_REPO="https://github.com/lac5q/memroos.git"
MEMROOS_DIR="${MEMROOS_INSTALL_DIR:-$HOME/memroos}"
MEMROOS_BRANCH="${MEMROOS_BRANCH:-main}"
INSTALL_MODE="${MEMROOS_INSTALL_MODE:-}"
# Default local install = the fully self-hosted stack (bundled Ollama + embedded
# Chroma + local Neo4j graph memory). docker-compose.demo.yml is the lighter,
# no-graph variant; docker-compose.yml is the production/managed-services stack.
DOCKER_COMPOSE_FILE="${MEMROOS_COMPOSE_FILE:-docker-compose.local.yml}"

log() { echo -e "${BLUE}➜ $1${NC}"; }
ok() { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
err() { echo -e "${RED}✗ $1${NC}" >&2; }

banner() {
  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║           MemroOS Installer              ║"
  echo "║     Agent Memory & Governance Plane      ║"
  echo "╚══════════════════════════════════════════╝"
  echo ""
}

detect_os() {
  case "$(uname -s)" in
    Darwin)  echo "darwin" ;;
    Linux)   echo "linux" ;;
    *)       echo "unknown" ;;
  esac
}

OS=$(detect_os)

has() { command -v "$1" &>/dev/null; }

usage() {
  cat <<'EOF'
MemroOS Installer

Usage:
  install.sh                 Interactive install
  install.sh --local         Full local self-hosted stack, incl. graph memory (default, Docker)
  install.sh --docker        Docker install using MEMROOS_COMPOSE_FILE (defaults to local)
  install.sh --demo          Lightweight local stack, no graph memory (native)
  install.sh --full          Native full setup wizard (managed Qdrant/Neo4j)

Environment:
  MEMROOS_INSTALL_DIR        Install directory (default: $HOME/memroos)
  MEMROOS_BRANCH             Git branch to clone (default: main)
  MEMROOS_COMPOSE_FILE       Compose file for --docker (default: docker-compose.local.yml)
  MEMROOS_UPDATE=1           Pull latest if already cloned
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --local)
        # Fully local, self-hosted Docker stack (default): includes graph memory.
        INSTALL_MODE="docker"
        DOCKER_COMPOSE_FILE="docker-compose.local.yml"
        ;;
      --docker|--container)
        INSTALL_MODE="docker"
        ;;
      --demo)
        INSTALL_MODE="demo"
        ;;
      --full)
        INSTALL_MODE="full"
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        err "Unknown option: $1"
        usage
        exit 1
        ;;
    esac
    shift
  done
}

needs_git() {
  if has git; then
    ok "Git $(git --version | awk '{print $3}') — OK"
    return 0
  fi
  warn "Git required"
  return 1
}

needs_node() {
  if has node; then
    local v
    v=$(node -v | tr -d 'v' | cut -d. -f1)
    if [[ "$v" -ge 20 ]]; then
      ok "Node.js $(node -v) — OK"
      return 0
    fi
  fi
  warn "Node.js 20+ required"
  return 1
}

needs_python() {
  if has python3; then
    local v
    v=$(python3 --version 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
    local major minor
    major=$(echo "$v" | cut -d. -f1)
    minor=$(echo "$v" | cut -d. -f2)
    if [[ "$major" -ge 3 && "$minor" -ge 10 ]]; then
      ok "Python $(python3 --version 2>&1) — OK"
      return 0
    fi
  fi
  warn "Python 3.10+ required"
  return 1
}

needs_docker() {
  if has docker; then
    ok "Docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1) — OK"
    return 0
  fi
  warn "Docker required"
  return 1
}

needs_compose() {
  if docker compose version &>/dev/null; then
    ok "Docker Compose — OK"
    return 0
  fi
  warn "Docker Compose required"
  return 1
}

needs_ollama() {
  if has ollama; then
    ok "Ollama — OK (optional)"
    return 0
  fi
  warn "Ollama — not installed (optional, for local LLM)"
  return 1
}

install_node_darwin() {
  if ! has brew; then
    echo "  Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi
  brew install node
}

install_node_linux() {
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
}

install_python_darwin() {
  brew install python@3.11
}

install_python_linux() {
  sudo apt-get install -y python3 python3-venv python3-pip
}

install_docker_darwin() {
  echo "  Please install Docker Desktop: https://docs.docker.com/desktop/install/mac-install/"
  echo "  Or: brew install --cask docker"
  return 1
}

install_docker_linux() {
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  echo "  Note: You may need to log out and back in for Docker group changes."
}

install_ollama_darwin() {
  brew install ollama
  ollama serve &
  sleep 2
  ollama pull qwen2.5:3b
  ollama pull nomic-embed-text
}

install_ollama_linux() {
  curl -fsSL https://ollama.com/install.sh | sh
  ollama pull qwen2.5:3b
  ollama pull nomic-embed-text
}

check_dependencies() {
  log "Checking dependencies..."
  echo ""

  local missing=()
  needs_git || missing+=("git")
  needs_docker || missing+=("docker")
  needs_compose || missing+=("docker-compose")

  if [[ "$INSTALL_MODE" != "docker" ]]; then
    needs_node || missing+=("node")
    needs_python || missing+=("python3")
    needs_ollama || true  # optional
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo ""
    echo "Missing required: ${missing[*]}"
    echo ""

    if [[ "${MEMROOS_AUTO_INSTALL:-0}" == "1" ]]; then
      log "Auto-installing missing dependencies..."
      for dep in "${missing[@]}"; do
        case "$dep" in
          git)
            if [[ "$OS" == "darwin" ]]; then brew install git; else sudo apt-get install -y git; fi
            ;;
          node)
            if [[ "$OS" == "darwin" ]]; then install_node_darwin; else install_node_linux; fi
            ;;
          python3)
            if [[ "$OS" == "darwin" ]]; then install_python_darwin; else install_python_linux; fi
            ;;
          docker)
            if [[ "$OS" == "darwin" ]]; then install_docker_darwin || return 1; else install_docker_linux; fi
            ;;
          docker-compose)
            warn "Docker Compose is included with Docker Desktop"
            ;;
        esac
      done
      ok "Dependencies installed"
    else
      read -rp "Install missing dependencies now? [Y/n] " answer
      if [[ "$answer" != "n" && "$answer" != "N" ]]; then
        for dep in "${missing[@]}"; do
          case "$dep" in
            git)
              if [[ "$OS" == "darwin" ]]; then brew install git; else sudo apt-get install -y git; fi
              ;;
            node)
              if [[ "$OS" == "darwin" ]]; then install_node_darwin; else install_node_linux; fi
              ;;
            python3)
              if [[ "$OS" == "darwin" ]]; then install_python_darwin; else install_python_linux; fi
              ;;
            docker)
              if [[ "$OS" == "darwin" ]]; then install_docker_darwin || return 1; else install_docker_linux; fi
              ;;
            docker-compose)
              warn "Docker Compose is included with Docker Desktop"
              ;;
          esac
        done
        ok "Dependencies installed"
      else
        err "Please install dependencies manually and re-run the installer."
        exit 1
      fi
    fi
  fi
}

clone_repo() {
  if [[ -d "$MEMROOS_DIR/.git" ]]; then
    log "MemroOS already installed at $MEMROOS_DIR"
    cd "$MEMROOS_DIR"
    if [[ "${MEMROOS_UPDATE:-0}" == "1" ]]; then
      log "Updating to latest..."
      git pull origin "$MEMROOS_BRANCH"
    fi
  else
    log "Cloning MemroOS..."
    git clone --branch "$MEMROOS_BRANCH" "$MEMROOS_REPO" "$MEMROOS_DIR"
    cd "$MEMROOS_DIR"
    ok "Cloned to $MEMROOS_DIR"
  fi
}

run_docker_install() {
  echo ""
  ok "Docker container install selected"
  echo ""

  cd "$MEMROOS_DIR"
  if [[ ! -f ".env" && -f ".env.example" ]]; then
    log "Generating .env from .env.example (with shell expansion of \${HOME} and friends)..."
    if command -v envsubst >/dev/null 2>&1; then
      envsubst < .env.example > .env
    else
      # Fallback when gettext's envsubst isn't installed: shell-source the
      # example and evaluate each non-comment assignment so ${HOME} expands.
      # POSIX-portable; same semantics for the variables INSTALL-REPRO-02 covers.
      while IFS= read -r line; do
        case "$line" in
          ''|\#*) printf '%s\n' "$line" >> .env ;;
          *=*)
            # shellcheck disable=SC2086
            key="${line%%=*}"; val="${line#*=}"
            # Evaluate variable references but reject command substitution
            # (${...} commands, $(...)) for safety; we only allow the form
            # ${HOME} and ${VAR:-default} style expansions.
            eval "expanded=\"$val\"" 2>/dev/null || expanded="$val"
            printf '%s=%s\n' "$key" "$expanded" >> .env
            ;;
          *) printf '%s\n' "$line" >> .env ;;
        esac
      done < .env.example
      chmod 600 .env
      ok "Created .env from .env.example with shell expansion (no envsubst)."
    fi
    chmod 600 .env
    ok "Created .env from .env.example"

    # Generate fresh per-install credentials so a reachable fresh install
    # does NOT ship the well-known 'memroos-local-*' defaults. install.sh
    # is the single source of truth; compose falls back to its env vars.
    if command -v openssl >/dev/null 2>&1; then
      gen_jwt="$(openssl rand -hex 32)"
      gen_pw="$(openssl rand -hex 18)"
      gen_neo="$(openssl rand -hex 12)"
      # Always replace ALL three credential rows (insert if missing).
      # Sets the value if the key already exists (e.g. set from
      # .env.example) or appends the line if the key is absent.
      set_or_append() {
        local key="$1"; local value="$2"
        if grep -q "^${key}=" .env 2>/dev/null; then
          sed -i "s|^${key}=.*|${key}=${value}|" .env
        else
          printf '%s=%s\n' "$key" "$value" >> .env
        fi
      }
      set_or_append 'MEMROOS_JWT_SECRET' "${gen_jwt}"
      set_or_append 'MEMROOS_ADMIN_PASSWORD' "${gen_pw}"
      set_or_append 'NEO4J_PASSWORD' "${gen_neo}"
      # Neo4j image reads NEO4J_AUTH (user/pass combined). We compose
      # it from the same NEO4J_PASSWORD so app + DB stay in sync.
      set_or_append 'MEMROOS_NEO4J_AUTH' "neo4j/${gen_neo}"
      chmod 600 .env
      ok "Generated per-install credentials (JWT_SECRET, ADMIN_PASSWORD, NEO4J_PASSWORD, NEO4J_AUTH)"
    else
      warn "openssl not found; reachable install will keep literal defaults"
    fi
  fi

  if [[ ! -f "$DOCKER_COMPOSE_FILE" ]]; then
    err "Compose file not found: $DOCKER_COMPOSE_FILE"
    exit 1
  fi

  log "Building and starting MemroOS containers..."
  echo "  Compose file: $DOCKER_COMPOSE_FILE"
  docker compose -f "$DOCKER_COMPOSE_FILE" up -d --build
}

select_mode() {
  case "$INSTALL_MODE" in
    docker)
      run_docker_install
      return
      ;;
    demo)
      echo ""
      ok "Demo mode selected — no configuration needed"
      "$MEMROOS_DIR/setup.sh" --demo
      return
      ;;
    full)
      echo ""
      log "Starting interactive setup..."
      "$MEMROOS_DIR/setup.sh" --wizard
      "$MEMROOS_DIR/setup.sh"
      return
      ;;
  esac

  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  How do you want to run MemroOS?                     ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo ""
  echo "  1. 🏠 Local (recommended) — full self-hosted stack (Docker)"
  echo "     Everything on this host: vector + graph memory, bundled Ollama."
  echo "     No cloud accounts needed."
  echo ""
  echo "  2. 🎯 Demo — lightweight local, no graph memory (native)"
  echo "     Fastest to boot; skips Neo4j graph memory."
  echo ""
  echo "  3. 🔧 Full Setup (production)"
  echo "     Requires Qdrant Cloud account and API keys."
  echo ""

  if [[ -n "${MEMROOS_MODE:-}" ]]; then
    choice="$MEMROOS_MODE"
  else
    read -rp "Choose [1-3] (default 1): " choice
  fi
  choice="${choice:-1}"

  case "$choice" in
    1)
      echo ""
      ok "Local self-hosted stack selected — no configuration needed"
      DOCKER_COMPOSE_FILE="docker-compose.local.yml"
      INSTALL_MODE="docker"
      run_docker_install
      ;;
    2)
      echo ""
      ok "Demo mode selected — no configuration needed"
      "$MEMROOS_DIR/setup.sh" --demo
      ;;
    3)
      echo ""
      log "Starting interactive setup..."
      "$MEMROOS_DIR/setup.sh" --wizard
      "$MEMROOS_DIR/setup.sh"
      ;;
    *)
      err "Invalid choice"
      exit 1
      ;;
  esac
}

show_status() {
  echo ""
  if [[ -f "$MEMROOS_DIR/scripts/show-status.mjs" ]]; then
    node "$MEMROOS_DIR/scripts/show-status.mjs"
  fi
}

install_agent_integrations() {
  # Wire MemroOS into every agent CLI on this machine.
  # This is the canonical install path — single source of truth.
  if [[ -x "$MEMROOS_DIR/scripts/install-agent-integrations.sh" ]]; then
    echo ""
    log "Wiring MemroOS into detected agent CLIs (Claude, Codex, Hermes, OpenClaw, etc.)..."
    if bash "$MEMROOS_DIR/scripts/install-agent-integrations.sh" --check >/dev/null 2>&1; then
      ok "Agent integrations already up to date"
    else
      bash "$MEMROOS_DIR/scripts/install-agent-integrations.sh" || \
        warn "Agent integrations install failed — agents will work but may not auto-persist research. Re-run: bash $MEMROOS_DIR/scripts/install-agent-integrations.sh"
    fi
  fi
}

show_next_steps() {
  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  Next Steps                                          ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo ""
  echo "  📖 Documentation:  https://github.com/lac5q/memroos#docs"
  echo "  🌐 Website:        https://memroos.com"
  echo "  💬 Community:      https://discord.gg/memroos"
  echo "  ⭐ Star the repo:   https://github.com/lac5q/memroos"
  echo ""
  echo "  Useful commands:"
  echo "    cd $MEMROOS_DIR"
  if [[ "$INSTALL_MODE" == "docker" ]]; then
    echo "    docker compose -f $DOCKER_COMPOSE_FILE ps       # Check containers"
    echo "    docker compose -f $DOCKER_COMPOSE_FILE logs -f  # View logs"
    echo "    docker compose -f $DOCKER_COMPOSE_FILE down     # Stop containers"
  else
    echo "    ./setup.sh --status     # Check service health"
    echo "    ./setup.sh --demo       # Restart in demo mode"
    echo "    ./setup.sh --wizard     # Re-configure API keys"
    echo "    docker compose logs -f  # View logs"
  fi
  echo ""
  echo "  Open http://localhost:3000 in your browser to get started."
  echo ""
}

main() {
  parse_args "$@"
  banner

  log "MemroOS Installer v1.0.0-beta.2"
  echo "  OS: $OS"
  echo "  Install dir: $MEMROOS_DIR"
  echo ""

  check_dependencies
  clone_repo
  select_mode
  install_agent_integrations
  show_status
  show_next_steps

  ok "MemroOS is running! 🚀"
}

main "$@"
