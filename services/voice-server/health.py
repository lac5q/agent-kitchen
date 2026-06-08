"""
voice-server/health.py
FastAPI /health endpoint on port 7861.

Reads session state written by server.py via the shared JSON file.
The Next.js /api/voice-status proxy (src/app/api/voice-status/route.ts)
polls this endpoint every 2 seconds.

Launch:
  python voice-server/health.py
"""
import json
import os
import pathlib
from datetime import datetime, timezone

import uvicorn
from fastapi import FastAPI

app = FastAPI()

_STATE_DIR = pathlib.Path(os.environ.get("MEMROOS_DATA_DIR", str(pathlib.Path.home() / ".memroos"))) / "voice"
_STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
SESSION_STATE_FILE = str(_STATE_DIR / "voice-session-state.json")


@app.get("/health")
async def health():
    """
    Returns session state:
      { active: bool, session_id: str|null, started_at: str|null, duration_secs: int|null }
    """
    try:
        with open(SESSION_STATE_FILE) as f:
            state = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        state = {"active": False, "session_id": None, "started_at": None}

    duration = None
    if state.get("started_at") and state.get("active"):
        delta = datetime.now(timezone.utc) - datetime.fromisoformat(state["started_at"])
        duration = int(delta.total_seconds())

    return {**state, "duration_secs": duration}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("VOICE_HEALTH_PORT", "7861")))
