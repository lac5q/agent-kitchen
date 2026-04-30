#!/bin/bash
#
# Resilient Mem0 Server Runner
# - Auto-restarts on crash
# - Health checks
# - Dependency verification
# - Logging
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

LOG_FILE="$SCRIPT_DIR/logs/mem0-server.log"
PID_FILE="$SCRIPT_DIR/logs/mem0-server.pid"
HEALTH_URL="http://localhost:3201/health"
MAX_RESTARTS=5
RESTART_DELAY=5

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_success() {
    log "${GREEN}✓ $1${NC}"
}

log_error() {
    log "${RED}✗ $1${NC}"
}

log_warn() {
    log "${YELLOW}⚠ $1${NC}"
}

# Create logs directory
mkdir -p "$SCRIPT_DIR/logs"

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        log_warn "Mem0 server already running (PID: $OLD_PID)"
        exit 0
    else
        log_warn "Stale PID file found, cleaning up"
        rm -f "$PID_FILE"
    fi
fi

# Check dependencies
check_dependencies() {
    log "Checking dependencies..."

    # Check Docker (for Qdrant)
    if ! command -v docker &> /dev/null; then
        log_error "Docker not found"
        return 1
    fi

    # Check if Qdrant is running
    if ! docker ps | grep -q qdrant; then
        log_error "Qdrant container not running"
        log "Starting Qdrant..."
        docker run -d -p 6333:6333 -p 6334:6334 --name qdrant qdrant/qdrant || {
            log_error "Failed to start Qdrant"
            return 1
        }
        sleep 5
    fi
    log_success "Qdrant is running"

    # Check virtual environment
    if [ -d "$SCRIPT_DIR/.venv" ]; then
        VENV_DIR="$SCRIPT_DIR/.venv"
    elif [ -d "/Users/lcalderon/github/knowledge/.venv" ]; then
        VENV_DIR="/Users/lcalderon/github/knowledge/.venv"
    else
        log_error "Virtual environment not found at .venv"
        return 1
    fi
    log_success "Virtual environment exists at $VENV_DIR"

    # Check required Python packages (use venv python directly)
    # Note: pyyaml imports as 'yaml', not 'pyyaml'
    VENV_PYTHON="$VENV_DIR/bin/python"
    for pkg in uvicorn fastapi qdrant_client pydantic yaml httpx mcp; do
        if ! "$VENV_PYTHON" -c "import $pkg" 2>/dev/null; then
            log_error "Python package '$pkg' not installed"
            return 1
        fi
    done
    log_success "All Python packages installed"

    # Check .env file
    if [ ! -f "$SCRIPT_DIR/.env" ]; then
        log_error ".env file not found"
        return 1
    fi
    log_success ".env file exists"

    return 0
}

# Health check function
health_check() {
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
    [ "$response" = "200" ]
}

# Wait for server to be healthy
wait_for_health() {
    local max_attempts=${1:-30}
    local attempt=1

    log "Waiting for server to be healthy..."
    while [ $attempt -le $max_attempts ]; do
        if health_check; then
            log_success "Server is healthy (attempt $attempt/$max_attempts)"
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
    done

    log_error "Server failed to become healthy after $max_attempts seconds"
    return 1
}

# Start the server
start_server() {
    log "Starting Mem0 server on port 3201..."

    # Load environment variables
    if [ -f "$SCRIPT_DIR/.env" ]; then
        set -a
        source "$SCRIPT_DIR/.env"
        set +a
    fi

    # Activate virtual environment
    if [ -d "$SCRIPT_DIR/.venv" ]; then
        source "$SCRIPT_DIR/.venv/bin/activate"
    elif [ -d "/Users/lcalderon/github/knowledge/.venv" ]; then
        source "/Users/lcalderon/github/knowledge/.venv/bin/activate"
    fi

    # Start uvicorn in background
    uvicorn mem0-server:app \
        --host 0.0.0.0 \
        --port 3201 \
        --reload \
        --log-level info \
        >> "$LOG_FILE" 2>&1 &

    local pid=$!
    echo $pid > "$PID_FILE"
    log_success "Server started with PID $pid"

    # Wait for health check
    if wait_for_health 30; then
        return 0
    else
        log_error "Server failed to start properly"
        return 1
    fi
}

# Stop the server
stop_server() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log "Stopping server (PID: $pid)..."
            kill "$pid" 2>/dev/null
            sleep 2
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null
            fi
            log_success "Server stopped"
        fi
        rm -f "$PID_FILE"
    fi
}

# Main supervisor loop
supervisor() {
    local restart_count=0
    local last_start_time=0

    log "Starting Mem0 supervisor..."
    log "Logs: $LOG_FILE"
    log "PID file: $PID_FILE"

    while true; do
        # Check if server is running
        if [ -f "$PID_FILE" ]; then
            local pid=$(cat "$PID_FILE")
            if ! kill -0 "$pid" 2>/dev/null; then
                log_error "Server process died (PID: $pid)"
                rm -f "$PID_FILE"
            fi
        fi

        # If not running, restart
        if [ ! -f "$PID_FILE" ]; then
            restart_count=$((restart_count + 1))

            if [ $restart_count -gt $MAX_RESTARTS ]; then
                local time_since_last=$(( $(date +%s) - last_start_time ))
                if [ $time_since_last -gt 300 ]; then
                    # Reset counter if last start was > 5 min ago
                    restart_count=1
                    log_warn "Resetting restart counter (last start was ${time_since_last}s ago)"
                else
                    log_error "Max restarts ($MAX_RESTARTS) exceeded. Giving up."
                    exit 1
                fi
            fi

            log "Restart attempt $restart_count/$MAX_RESTARTS..."

            if start_server; then
                last_start_time=$(date +%s)
                log_success "Server running"
            else
                log_error "Failed to start server"
            fi
        fi

        # Periodic health check
        if [ -f "$PID_FILE" ]; then
            if ! health_check; then
                log_warn "Health check failed, restarting..."
                stop_server
                sleep 2
            fi
        fi

        sleep 10
    done
}

# Handle command line arguments
case "${1:-start}" in
    start)
        if ! check_dependencies; then
            log_error "Dependency check failed"
            exit 1
        fi
        supervisor
        ;;
    stop)
        stop_server
        log_success "Server stopped"
        ;;
    restart)
        stop_server
        sleep 2
        if ! check_dependencies; then
            log_error "Dependency check failed"
            exit 1
        fi
        supervisor
        ;;
    status)
        if [ -f "$PID_FILE" ]; then
            local pid=$(cat "$PID_FILE")
            if kill -0 "$pid" 2>/dev/null; then
                if health_check; then
                    log_success "Server is running (PID: $pid) - Healthy"
                else
                    log_warn "Server is running (PID: $pid) - Unhealthy"
                fi
            else
                log_error "Server not running (stale PID file)"
            fi
        else
            log "Server is not running"
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
