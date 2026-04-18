"""
voice-server/server.py
WebsocketServerTransport entrypoint on port 7860.

Two-port architecture:
- Port 7860: Pipecat audio WebSocket (this file)
- Port 7861: FastAPI /health endpoint (health.py)

Launch:
  python voice-server/server.py &
  python voice-server/health.py &
"""
import asyncio
import json
import os
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv

# 1.0.0 fully-qualified import paths (breaking change from 0.0.x)
from pipecat.transports.network.websocket_server import (
    WebsocketServerTransport,
    WebsocketServerParams,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.pipeline.runner import PipelineRunner

load_dotenv()

SESSION_STATE_FILE = "/tmp/voice-session-state.json"


def _write_state(active: bool, session_id: str | None) -> None:
    """Write session state to shared JSON file (read by health.py)."""
    state = {
        "active": active,
        "session_id": session_id,
        "started_at": datetime.now(timezone.utc).isoformat() if active else None,
    }
    with open(SESSION_STATE_FILE, "w") as f:
        json.dump(state, f)


async def build_pipeline(transport, session_id: str) -> Pipeline:
    """Build the appropriate pipeline based on VOICE_MODE env var."""
    mode = os.getenv("VOICE_MODE", "gemini").lower()
    if mode == "cascade":
        from pipeline_cascade import build_cascade_pipeline
        return build_cascade_pipeline(transport, session_id)
    else:
        from pipeline_gemini import build_gemini_pipeline
        return build_gemini_pipeline(transport, session_id)


async def run_voice_server() -> None:
    transport = WebsocketServerTransport(
        host="0.0.0.0",
        port=7860,
        params=WebsocketServerParams(audio_out_enabled=True),
    )

    @transport.event_handler("on_client_connected")
    async def on_connected(transport, websocket):
        session_id = str(uuid.uuid4())
        _write_state(active=True, session_id=session_id)
        pipeline = await build_pipeline(transport, session_id)
        task = PipelineTask(pipeline, params=PipelineParams(enable_metrics=True))
        runner = PipelineRunner(handle_sigint=False)
        await runner.run(task)

    @transport.event_handler("on_client_disconnected")
    async def on_disconnected(transport, websocket):
        _write_state(active=False, session_id=None)

    # WebsocketServerTransport manages its own asyncio server loop
    await transport.run()


if __name__ == "__main__":
    asyncio.run(run_voice_server())
