# Phase 22: Voice Server - Research

**Researched:** 2026-04-17
**Domain:** Pipecat Python voice service, Gemini Live, STT/TTS cascade, SQLite transcript storage, dashboard voice panel
**Confidence:** HIGH (core Pipecat APIs verified via official docs and PyPI registry; fallback chain custom code identified)

---

## Summary

Phase 22 adds a standalone Python voice service using Pipecat 1.0.0 (released 2026-04-14). The service runs in a dedicated directory (`voice-server/`) alongside the Next.js app and uses a two-port architecture: `WebsocketServerTransport` on port 7860 owns the audio WebSocket connection, and FastAPI on port 7861 serves the `/health` JSON endpoint. Two voice modes are supported: Gemini Live (speech-to-speech, low latency) and a cascade fallback (Groq Whisper STT → agent LLM → Cartesia TTS, with deeper offline fallbacks). Every utterance is written as a `messages` row to the existing shared SQLite database (`data/conversations.db`) so it appears in `/api/recall`. The dashboard voice panel (DASH-04) polls a thin `/api/voice-status` Next.js proxy to the Python `/health` endpoint, and uses `@pipecat-ai/websocket-transport` for the browser mic connection.

The most significant sharp edge is **Pipecat 1.0.0 import path reorganization** — all 0.0.x import paths are broken. All code in this phase must use the new fully-qualified submodule imports (documented in every pattern below). The second sharp edge is **Python version**: the system default is 3.14 but pipecat's binary dependencies (faster-whisper, kokoro-onnx) do not yet have 3.14 wheels. The venv must be pinned to Python 3.12 or 3.13, both of which are installed at `/opt/homebrew/bin/python3.12` and `/opt/homebrew/bin/python3.13`.

**Primary recommendation:** Two-process launch: `python voice-server/server.py` runs the Pipecat audio server on port 7860, and `python voice-server/health.py` runs FastAPI on port 7861. Transcript persistence goes directly to SQLite via Python `sqlite3` (same WAL-mode file as Next.js). The dashboard voice panel uses `@pipecat-ai/websocket-transport@1.6.2` and `@pipecat-ai/client-js@1.7.0` for the mic connection.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VOICE-01 | Pipecat Python service runs on a dedicated port with WebSocket transport to the dashboard | WebsocketServerTransport on port 7860 (owns the port); FastAPI /health on port 7861 |
| VOICE-02 | Gemini Live mode: speech-to-speech, low latency, routed to active agent | GeminiLiveLLMService with Settings(model="models/gemini-2.5-flash-native-audio-preview-12-2025") |
| VOICE-03 | Cascade mode: Groq Whisper STT → Cartesia TTS with defined fallback chain | GroqSTTService → CartesiaTTSService → ElevenLabsTTSService → GradiumTTSService → KokoroTTSService → custom macOS say wrapper |
| VOICE-04 | All voice session transcripts written to SQLite conversation store, searchable via SQLDB-01 | TranscriptProcessor.user()/.assistant() in pipeline + on_transcript_update → TranscriptWriter |
| VOICE-05 | Dashboard shows active voice session status and scrollable transcript log | PipecatClient + WebSocketTransport on ws://localhost:7860; /api/voice-status proxies /health |
| DASH-04 | Voice session log in dashboard: active/inactive indicator, last session duration, scrollable transcript | VoicePanel component polling /api/voice-status; transcript rows via /api/recall |
</phase_requirements>

---

## Standard Stack

### Core — Python Service

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pipecat-ai | 1.0.0 | Voice pipeline orchestration | The project-specified framework |
| pipecat-ai[google] | 1.0.0 | Gemini Live LLM service | Required for VOICE-02 |
| pipecat-ai[groq] | 1.0.0 | Groq Whisper STT | Required for VOICE-03 |
| pipecat-ai[cartesia] | 1.0.0 | Cartesia TTS | Required for VOICE-03 |
| pipecat-ai[elevenlabs] | 1.0.0 | ElevenLabs TTS fallback | Required for VOICE-03 |
| pipecat-ai[websocket] | 1.0.0 | WebsocketServerTransport | Owns port 7860, audio frames |
| pipecat-ai[kokoro] | 1.0.0 | KokoroTTSService (local, kokoro-onnx) | Offline TTS fallback, no API key |
| fastapi | ^0.115 | /health endpoint server | Separate port 7861 |
| uvicorn | ^0.32 | ASGI server for FastAPI | Runs health server |
| python-dotenv | ^1.0 | Load .env with API keys | Standard pattern |

**Version verification:** [VERIFIED: pip3 index versions pipecat-ai → 1.0.0 is latest, 2026-04-17]

### Core — Dashboard Client (Next.js)

| Package | Version | Purpose |
|---------|---------|---------|
| @pipecat-ai/client-js | 1.7.0 | PipecatClient browser SDK |
| @pipecat-ai/websocket-transport | 1.6.2 | Browser WebSocket transport to Pipecat port 7860 |

**Version verification:** [VERIFIED: npm registry 2026-04-17]

### Installation

```bash
# Python service (in voice-server/ subdirectory)
# CRITICAL: use python3.12 or python3.13, NOT 3.14
uv venv --python /opt/homebrew/bin/python3.12 .venv
source .venv/bin/activate
uv pip install "pipecat-ai[google,groq,cartesia,elevenlabs,websocket,kokoro]" fastapi uvicorn python-dotenv pytest pytest-asyncio

# Next.js dashboard additions
npm install @pipecat-ai/client-js @pipecat-ai/websocket-transport
```

---

## Architecture Patterns

### Project Structure

```
voice-server/                    # Standalone Python service (NOT in src/)
├── .venv/                       # Python 3.12 virtual env (pinned)
├── .env                         # GOOGLE_API_KEY, GROQ_API_KEY, CARTESIA_API_KEY, SQLITE_DB_PATH
├── requirements.txt             # Pinned versions for reproducibility
├── server.py                    # WebsocketServerTransport entrypoint (port 7860)
├── health.py                    # FastAPI /health server (port 7861)
├── pipeline_gemini.py           # GeminiLiveLLMService pipeline builder
├── pipeline_cascade.py          # GroqSTT → LLM → CartesiaTTS pipeline builder
├── transcript_writer.py         # SQLite transcript persistence helper
├── fallback_tts.py              # FallbackTTSService wrapper (custom)
└── tests/
    ├── conftest.py              # Shared fixtures (in-memory SQLite)
    ├── test_health.py           # VOICE-01
    ├── test_pipeline_gemini.py  # VOICE-02
    ├── test_fallback_tts.py     # VOICE-03
    └── test_transcript_writer.py # VOICE-04

src/
├── app/api/
│   └── voice-status/route.ts   # Proxy: GET http://localhost:7861/health
└── components/
    └── voice/
        ├── VoicePanel.tsx       # DASH-04: status + duration + transcript log
        └── useVoiceTranscript.ts # Hook: /api/recall filtered by voice session_id
```

---

### Pattern 1: Two-Port Server Architecture (VOICE-01)

**What:** `WebsocketServerTransport` runs its own asyncio WebSocket server on port 7860 — it is NOT a FastAPI route handler. It does not accept a `websocket=` parameter. A separate FastAPI process runs on port 7861 and exposes only `/health`.

**CRITICAL DISTINCTION:**
- `WebsocketServerTransport(host=, port=)` — manages its own server socket; incompatible with FastAPI routing
- `FastAPIWebsocketTransport(websocket=fastapi_ws, params=...)` — injects into a FastAPI route; primarily for telephony

For this project, use `WebsocketServerTransport` (simpler, well-documented for non-telephony). Two ports is the cleanest approach.

```python
# voice-server/server.py
# Source: docs.pipecat.ai/server/services/transport/websocket-server [VERIFIED]
import asyncio, os, uuid
from datetime import datetime, timezone
from dotenv import load_dotenv

from pipecat.transports.network.websocket_server import (
    WebsocketServerTransport,
    WebsocketServerParams,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.pipeline.runner import PipelineRunner

load_dotenv()

# Shared state — written by this server, read by health.py via shared dict or file
SESSION_STATE_FILE = "/tmp/voice-session-state.json"

async def run_voice_server():
    transport = WebsocketServerTransport(
        host="0.0.0.0",
        port=7860,
        params=WebsocketServerParams(audio_out_enabled=True),
    )

    @transport.event_handler("on_client_connected")
    async def on_connected(transport, websocket):
        # Import the active mode pipeline (gemini or cascade)
        session_id = str(uuid.uuid4())
        _write_state(active=True, session_id=session_id)
        # pipeline_gemini or pipeline_cascade depending on mode env var
        pipeline = await build_pipeline(transport, session_id)
        task = PipelineTask(pipeline, params=PipelineParams(enable_metrics=True))
        runner = PipelineRunner(handle_sigint=False)
        await runner.run(task)

    @transport.event_handler("on_client_disconnected")
    async def on_disconnected(transport, websocket):
        _write_state(active=False, session_id=None)

    # WebsocketServerTransport manages its own asyncio server loop
    await transport.run()

def _write_state(active: bool, session_id: str | None):
    import json
    state = {
        "active": active,
        "session_id": session_id,
        "started_at": datetime.now(timezone.utc).isoformat() if active else None,
    }
    with open(SESSION_STATE_FILE, "w") as f:
        json.dump(state, f)

if __name__ == "__main__":
    asyncio.run(run_voice_server())
```

```python
# voice-server/health.py
# Source: FastAPI docs
import json, os
from datetime import datetime, timezone
from fastapi import FastAPI
import uvicorn

app = FastAPI()
SESSION_STATE_FILE = "/tmp/voice-session-state.json"

@app.get("/health")
async def health():
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
    uvicorn.run(app, host="0.0.0.0", port=7861)
```

**Launch (add to project's start scripts or a Procfile):**
```bash
python voice-server/server.py &
python voice-server/health.py &
```

---

### Pattern 2: Gemini Live Pipeline (VOICE-02)

**What:** Single-service speech-to-speech pipeline. No separate STT or TTS — Gemini Live handles both. [VERIFIED: docs.pipecat.ai/server/services/s2s/gemini-live]

**Sharp edge:** `TEXT` modality is not supported by recent Gemini Live models. Voice only.

**1.0.0 import paths (ALL CHANGED from 0.0.x):**
- OLD (broken): `from pipecat.services.gemini_multimodal_live.gemini import GeminiMultimodalLiveLLMService`
- NEW: `from pipecat.services.google.gemini_live import GeminiLiveLLMService`
- OLD (broken): `from pipecat.processors.aggregators.openai_llm_context import LLMContext`
- NEW: `from pipecat.processors.aggregators.llm_context import LLMContext`

```python
# voice-server/pipeline_gemini.py
# Source: docs.pipecat.ai/server/services/s2s/gemini-live [VERIFIED]
import os
from pipecat.services.google.gemini_live import (
    GeminiLiveLLMService,
    GeminiVADParams,
)
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.pipeline.pipeline import Pipeline
from .transcript_writer import TranscriptWriter
from .transcript_proc_helper import build_transcript_proc

def build_gemini_pipeline(transport, session_id: str):
    llm = GeminiLiveLLMService(
        api_key=os.getenv("GOOGLE_API_KEY"),
        settings=GeminiLiveLLMService.Settings(
            model="models/gemini-2.5-flash-native-audio-preview-12-2025",
            system_instruction="You are a helpful kitchen assistant for Agent Kitchen.",
            voice="Puck",
            vad=GeminiVADParams(silence_duration_ms=500),
        ),
    )
    context = LLMContext()
    agg = llm.create_context_aggregator(context)
    transcript_proc = build_transcript_proc(session_id)

    return Pipeline([
        transport.input(),
        agg.user(),
        transcript_proc.user(),    # capture user turns after aggregation
        llm,
        transcript_proc.assistant(),  # capture assistant turns
        transport.output(),
        agg.assistant(),
    ])
```

---

### Pattern 3: Cascade Pipeline (VOICE-03)

**What:** Standard STT → LLM → TTS pipeline. Uses `GroqSTTService` as primary STT and `FallbackTTSService` (custom) for TTS chain.

**1.0.0 import paths:**
- `from pipecat.services.groq.stt import GroqSTTService`
- `from pipecat.services.cartesia.tts import CartesiaTTSService`
- `from pipecat.services.elevenlabs.tts import ElevenLabsTTSService`
- `from pipecat.processors.aggregators.llm_context import LLMContext`
- `from pipecat.audio.vad.silero import SileroVADAnalyzer`

```python
# voice-server/pipeline_cascade.py
import os
from pipecat.services.groq.stt import GroqSTTService
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.pipeline.pipeline import Pipeline
from .fallback_tts import build_fallback_tts
from .transcript_proc_helper import build_transcript_proc

def build_cascade_pipeline(transport, session_id: str):
    stt = GroqSTTService(
        api_key=os.getenv("GROQ_API_KEY"),
        settings=GroqSTTService.Settings(
            model="whisper-large-v3-turbo",
            language=None,  # auto-detect
        ),
    )
    tts = build_fallback_tts()  # returns FallbackTTSService
    llm = OpenAILLMService(
        api_key=os.getenv("ANTHROPIC_API_KEY") or os.getenv("OPENAI_API_KEY"),
        model=os.getenv("VOICE_AGENT_MODEL", "claude-opus-4-5"),
    )
    context = LLMContext()
    agg = llm.create_context_aggregator(context)
    transcript_proc = build_transcript_proc(session_id)

    return Pipeline([
        transport.input(),
        SileroVADAnalyzer(),
        stt,
        agg.user(),
        transcript_proc.user(),
        llm,
        tts,
        transcript_proc.assistant(),
        transport.output(),
        agg.assistant(),
    ])
```

---

### Pattern 4: TranscriptProcessor API (VOICE-04)

**What:** `TranscriptProcessor` is a factory class. Call `.user()` and `.assistant()` to get two processors that share an `on_transcript_update` event. Each processor handles one role. [VERIFIED: docs.pipecat.ai + confirmed user/assistant factory method pattern]

The `on_transcript_update` event receives `(processor, frame, direction)`. The `frame` is a `TranscriptionMessage` with `role` and `content` fields. [ASSUMED: field name is `content` not `text` — verify at install time; see A5]

```python
# voice-server/transcript_proc_helper.py
from pipecat.processors.transcript_processor import TranscriptProcessor
from .transcript_writer import TranscriptWriter
import os

def build_transcript_proc(session_id: str) -> TranscriptProcessor:
    proc = TranscriptProcessor()
    writer = TranscriptWriter(
        db_path=os.getenv("SQLITE_DB_PATH", "data/conversations.db"),
        session_id=session_id,
    )

    @proc.event_handler("on_transcript_update")
    async def on_update(processor, frame, direction):
        # frame.role is "user" or "assistant"
        # frame.content (or frame.text — verify in 1.0.0) is the transcript text
        text = getattr(frame, "content", None) or getattr(frame, "text", "")
        if text.strip():
            writer.write(role=frame.role, content=text)

    return proc

# Usage in pipeline:
# transcript_proc = build_transcript_proc(session_id)
# Pipeline([..., transcript_proc.user(), llm, transcript_proc.assistant(), ...])
```

---

### Pattern 5: FallbackTTSService (custom — VOICE-03 chain)

Pipecat has no built-in TTS fallback chaining. This is ~50 lines of custom code. [ASSUMED: no official fallback chain documented]

```python
# voice-server/fallback_tts.py
import asyncio
import subprocess
import os
from pipecat.services.tts_service import TTSService

class FallbackTTSService(TTSService):
    """Tries TTS providers in order. Falls through on exception."""
    def __init__(self, providers: list[TTSService], **kwargs):
        super().__init__(**kwargs)
        self._providers = providers
        self._active_idx = 0

    async def run_tts(self, text: str):
        for i, provider in enumerate(self._providers):
            if i < self._active_idx:
                continue
            try:
                async for chunk in provider.run_tts(text):
                    yield chunk
                return
            except Exception as e:
                self._logger.warning(f"TTS provider {i} ({type(provider).__name__}) failed: {e}")
                self._active_idx = i + 1
        # All providers exhausted — macOS say as absolute last resort
        await asyncio.to_thread(subprocess.run, ["say", text], check=False)


def build_fallback_tts() -> FallbackTTSService:
    from pipecat.services.cartesia.tts import CartesiaTTSService
    from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
    from pipecat.services.kokoro.tts import KokoroTTSService  # local, no API key

    providers = []
    if os.getenv("CARTESIA_API_KEY"):
        providers.append(CartesiaTTSService(
            api_key=os.getenv("CARTESIA_API_KEY"),
            settings=CartesiaTTSService.Settings(voice="sonic-3"),
        ))
    if os.getenv("ELEVENLABS_API_KEY"):
        providers.append(ElevenLabsTTSService(
            api_key=os.getenv("ELEVENLABS_API_KEY"),
        ))
    # KokoroTTSService always available as local fallback
    providers.append(KokoroTTSService())
    return FallbackTTSService(providers=providers)
```

**TTS fallback chain order (VOICE-03):**
1. `CartesiaTTSService` (sonic-3) — primary
2. `ElevenLabsTTSService` — first cloud fallback
3. `GradiumTTSService` — second cloud fallback (add if GRADIUM_API_KEY set)
4. `KokoroTTSService` — local offline, kokoro-onnx engine, no API key
5. macOS `say` subprocess — absolute last resort (macOS only; produces no audio frames)

**STT fallback chain (VOICE-03):**
1. `GroqSTTService` — primary (fastest)
2. `WhisperSTTServiceMLX` — local fallback, Apple Silicon optimized [ASSUMED: import path `pipecat.services.whisper.stt`]

---

### Pattern 6: TranscriptWriter — SQLite Persistence (VOICE-04)

The existing `messages` table in `data/conversations.db` already has the right shape. Voice transcripts go in as `agent_id='voice'`, `project='agent-kitchen'`.

WAL mode + busy_timeout=5000ms are set by the Next.js process. Python must also set them on every new connection. [VERIFIED: src/lib/db.ts lines 18-20]

The `SQLITE_DB_PATH` env var must be shared between Next.js and the Python service, declared as an **absolute path** in a root-level `.env`.

```python
# voice-server/transcript_writer.py
import sqlite3, uuid
from datetime import datetime, timezone

class TranscriptWriter:
    def __init__(self, db_path: str, session_id: str):
        self.db_path = db_path
        self.session_id = session_id

    def write(self, role: str, content: str) -> None:
        with sqlite3.connect(self.db_path, timeout=5.0) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=5000")
            conn.execute(
                """INSERT OR IGNORE INTO messages
                   (session_id, project, agent_id, role, content, timestamp, request_id)
                   VALUES (?, 'agent-kitchen', 'voice', ?, ?, ?, ?)""",
                (self.session_id, role, content,
                 datetime.now(timezone.utc).isoformat(),
                 str(uuid.uuid4())),
            )
```

**FTS5 auto-index note:** The `messages_ai` trigger (in `db-schema.ts`) automatically updates `messages_fts` on INSERT, so voice transcripts are immediately searchable via `/api/recall?q=...`. [VERIFIED: src/lib/db-schema.ts lines 42-47]

---

### Pattern 7: Dashboard Voice Panel (VOICE-05, DASH-04)

**Three data flows:**

1. **Status polling:** Next.js `/api/voice-status/route.ts` proxies to Python port 7861 `/health`. VoicePanel polls every 2 seconds with `useQuery`.
2. **Microphone connection:** `PipecatClient` + `WebSocketTransport` connects browser mic directly to `ws://localhost:7860` (the Pipecat WS server).
3. **Transcript display:** `useVoiceTranscript()` hook calls `/api/recall?q=&agent_id=voice` to show the session log.

```typescript
// src/app/api/voice-status/route.ts
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const res = await fetch('http://localhost:7861/health', { cache: 'no-store' });
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({ active: false, error: 'voice server unavailable' });
  }
}
```

```typescript
// src/components/voice/VoicePanel.tsx — browser mic + status
// Source: docs.pipecat.ai/client/js/transports/websocket [VERIFIED]
import { PipecatClient } from '@pipecat-ai/client-js';
import { WebSocketTransport, ProtobufFrameSerializer } from '@pipecat-ai/websocket-transport';

const client = new PipecatClient({
  transport: new WebSocketTransport({
    serializer: new ProtobufFrameSerializer(),
    recorderSampleRate: 16000,
    playerSampleRate: 16000,
  }),
  enableMic: true,
  enableCam: false,
});

// Connect on user click
await client.connect({ wsUrl: 'ws://localhost:7860' });
```

---

### Anti-Patterns to Avoid

- **Passing `websocket=fastapi_ws` to `WebsocketServerTransport`:** This is a constructor error. `WebsocketServerTransport` takes `host=` and `port=` and owns its own server. Use `FastAPIWebsocketTransport` if you need FastAPI routing (telephony use case).
- **Embedding Pipecat in Next.js:** Pipecat is Python; it is a separate process. Never import it in TypeScript.
- **Using Python 3.14:** Binary wheels for faster-whisper and kokoro-onnx do not exist for 3.14. Pin to 3.12.
- **Old 0.0.x import paths:** Every example on the internet uses pre-1.0.0 paths. They are removed. Use the paths in patterns above.
- **Same `TranscriptProcessor` instance in pipeline twice:** `TranscriptProcessor` is a factory. Use `proc.user()` and `proc.assistant()` as distinct objects in the pipeline list.
- **Relative SQLITE_DB_PATH:** The Python service cwd differs from Next.js cwd. Use an absolute path in a shared `.env`.
- **Direct Qdrant writes from voice service:** Per project constraint (PROJECT.md), mem0 collection writes go via mem0 HTTP API only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Voice pipeline orchestration | Custom frame routing | Pipecat Pipeline + PipelineTask | Handles concurrency, backpressure, interruption |
| Gemini Live session management | Raw WebSocket to Google | GeminiLiveLLMService | Handles reconnection (3 attempts), turn_complete race, VAD |
| Browser audio recording + encoding | Custom MediaRecorder | @pipecat-ai/websocket-transport | Handles PCM encoding, ProtobufFrameSerializer, bidirectional frames |
| VAD (voice activity detection) | Energy threshold detector | SileroVADAnalyzer or Gemini server-side VAD | Silero is battle-tested; Gemini VAD is zero-config |
| Transcript normalization | String parsing | TranscriptProcessor + .user()/.assistant() | Handles role attribution, Gemini chunked output aggregation |

---

## Common Pitfalls

### Pitfall 1: Python 3.14 Binary Wheel Gap (BLOCKING)
**What goes wrong:** `uv pip install pipecat-ai[kokoro]` fails — no kokoro-onnx or faster-whisper wheels for 3.14.
**Why it happens:** Python 3.14 is weeks old; the C-extension ecosystem hasn't caught up.
**How to avoid:** `uv venv --python /opt/homebrew/bin/python3.12 .venv`. Both 3.11, 3.12, 3.13 are installed.
**Warning signs:** `ERROR: Could not find a version that satisfies the requirement faster-whisper`

### Pitfall 2: Pipecat 1.0.0 Import Path Breakage (BLOCKING)
**What goes wrong:** Any code copied from the web uses 0.0.x flat imports → `ImportError` immediately.
**Why it happens:** 1.0.0 reorganized all service imports into submodules and removed the old paths.
**How to avoid:** Use every import exactly as written in the patterns above. Run these smoke checks after install:
```bash
python -c "from pipecat.services.google.gemini_live import GeminiLiveLLMService"
python -c "from pipecat.services.groq.stt import GroqSTTService"
python -c "from pipecat.processors.aggregators.llm_context import LLMContext"
```

### Pitfall 3: WebsocketServerTransport Constructor Confusion
**What goes wrong:** Passing `websocket=fastapi_ws` to `WebsocketServerTransport` raises a `TypeError` at startup.
**Why it happens:** `WebsocketServerTransport` runs its own asyncio server (takes `host`, `port`). `FastAPIWebsocketTransport` is the one that accepts a FastAPI WebSocket object.
**How to avoid:** Follow the two-port architecture in Pattern 1 exactly.
**Warning signs:** `TypeError: __init__() got an unexpected keyword argument 'websocket'`

### Pitfall 4: TranscriptProcessor — Same Instance Twice
**What goes wrong:** Putting the same `proc` instance at two positions in the pipeline list causes frames to be processed twice or dropped.
**Why it happens:** Each pipeline element is a distinct processor. Using one instance in two positions is a wiring error.
**How to avoid:** Use the factory: `proc.user()` and `proc.assistant()` return distinct objects that share the event handler.

### Pitfall 5: Gemini Live TEXT Modality Error
**What goes wrong:** Setting `modalities=["TEXT", "AUDIO"]` causes an error with current Gemini Live models.
**Why it happens:** Recent models dropped TEXT modality. [VERIFIED: docs.pipecat.ai — "TEXT modality may not be supported"]
**How to avoid:** Use audio-only mode. For transcripts, rely on `on_transcript_update` from the LLM aggregator.

### Pitfall 6: SQLite Cross-Process Write Conflicts
**What goes wrong:** Python transcript writes deadlock or fail with `database is locked`.
**Why it happens:** SQLite allows multiple readers but single writer; cross-process access needs WAL.
**How to avoid:** Python must set `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` on every `sqlite3.connect()` call. Next.js already sets these; Python must repeat them independently (no shared C extension singleton). [VERIFIED: src/lib/db.ts lines 18-20]

### Pitfall 7: Gemini Live User Transcription Missing
**What goes wrong:** User speech turns appear empty; only assistant turns are captured.
**Why it happens:** Known issue in some Pipecat builds — GeminiLiveLLMService may not emit user TranscriptionFrames. [CITED: github.com/pipecat-ai/pipecat/issues/3350]
**How to avoid:** Add `transcript_proc.user()` after `agg.user()` (not after STT, since Gemini has no STT stage). Also verify in 1.0.0 whether this is fixed; if not, supplement by extracting the last user message from `LLMContext` at turn boundaries.

### Pitfall 8: Single Client Limit on WebsocketServerTransport
**What goes wrong:** Opening a second connection (e.g., a new browser tab or hot reload) closes the existing session.
**Why it happens:** `WebsocketServerTransport` enforces one client at a time. [VERIFIED: docs.pipecat.ai]
**How to avoid:** Disable the "Connect" button in VoicePanel while a session is active (check `/api/voice-status` before enabling).

### Pitfall 9: Relative SQLITE_DB_PATH
**What goes wrong:** Python opens `data/conversations.db` relative to `voice-server/` while Next.js opens it relative to the project root — two different files.
**Why it happens:** `process.cwd()` differs between the two processes.
**How to avoid:** Declare `SQLITE_DB_PATH=/absolute/path/to/data/conversations.db` in the shared root `.env`. Both processes load the same absolute path.

---

## Code Examples

### Smoke-Test Imports After Install

```bash
# Run this after uv pip install to confirm 1.0.0 paths work
python -c "
from pipecat.services.google.gemini_live import GeminiLiveLLMService, GeminiVADParams
from pipecat.services.groq.stt import GroqSTTService
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.transcript_processor import TranscriptProcessor
from pipecat.transports.network.websocket_server import WebsocketServerTransport
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask
from pipecat.pipeline.runner import PipelineRunner
print('All imports OK')
"
```

### TranscriptProcessor Factory Pattern

```python
# Source: docs.pipecat.ai + community confirmed pattern
from pipecat.processors.transcript_processor import TranscriptProcessor

proc = TranscriptProcessor()

@proc.event_handler("on_transcript_update")
async def on_update(processor, frame, direction):
    # frame.role — "user" or "assistant"
    # frame.content or frame.text (verify at runtime — see A5)
    text = getattr(frame, "content", None) or getattr(frame, "text", "")
    writer.write(role=frame.role, content=text)

# In pipeline:
Pipeline([
    transport.input(),
    stt,
    proc.user(),        # distinct UserTranscriptProcessor object
    context_agg.user(),
    llm,
    proc.assistant(),   # distinct AssistantTranscriptProcessor object
    transport.output(),
    context_agg.assistant(),
])
```

### Next.js Voice Status Proxy

```typescript
// src/app/api/voice-status/route.ts
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const res = await fetch('http://localhost:7861/health', { cache: 'no-store' });
    if (!res.ok) throw new Error(`health returned ${res.status}`);
    return Response.json(await res.json());
  } catch {
    return Response.json({ active: false, mode: null, duration_secs: null, error: 'voice server unavailable' });
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `GeminiMultimodalLiveLLMService` | `GeminiLiveLLMService` | Pipecat 1.0.0 (2026-04-14) | All old imports broken |
| Flat imports `from pipecat.services.groq import ...` | Submodule imports `from pipecat.services.groq.stt import ...` | Pipecat 1.0.0 | Every example on the web is outdated |
| `OpenAILLMContext`, `AnthropicLLMContext` (service-specific) | `LLMContext` (unified) | Pipecat 1.0.0 | Import from `pipecat.processors.aggregators.llm_context` |
| `voice_id=` / `model=` constructor params | `settings=CartesiaTTSService.Settings(voice=..., model=...)` | Deprecated 0.0.105, removed 1.0.0 | Constructor signature changed |
| Gemini model `gemini-2.0-flash-live-001` | `models/gemini-2.5-flash-native-audio-preview-12-2025` | Early 2026 | Audio quality significantly improved |
| `kokoro` backend | `kokoro-onnx` backend | Recent | `KokoroTTSService` switched to ONNX runtime |
| VAD default stop_secs = 0.8s | stop_secs = 0.2s | Pipecat 1.0.0 | Faster STT transcription; check if too aggressive |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | FallbackTTSService must be custom code — Pipecat has no built-in TTS fallback chaining | Don't Hand-Roll, Pattern 5 | If built-in exists, saves ~50 lines; low risk |
| A2 | macOS `say` produces no Pipecat audio frames (subprocess call only, silence in stream) | Pattern 5 | Could fail silently on non-macOS; test on macOS |
| A3 | Cascade mode LLM is a fixed model (Claude or OpenAI), not runtime agent routing | Pitfall 7 | If "active agent" routing is required in scope, significant expansion |
| A4 | `WhisperSTTServiceMLX` import path in 1.0.0 is `pipecat.services.whisper.stt` | Pattern 3 | ImportError; run smoke test at install |
| A5 | `TranscriptMessage` frame has `.role` and `.content` fields (not `.text`) | Pattern 4, 6 | AttributeError; check with `dir(frame)` at runtime |
| A6 | `KokoroTTSService` import path is `pipecat.services.kokoro.tts` | Pattern 5 | ImportError; run smoke test |
| A7 | `GradiumTTSService` is available as `pipecat.services.gradium.tts` or similar | Pattern 5 | Module not found; skip Gradium from fallback chain if not found |

---

## Open Questions

1. **"Active agent" routing scope**
   - What we know: Phase 20 hive mind tracks agents; VOICE-02/03 say "routed to the active agent"
   - What's unclear: Is there a defined protocol for selecting which agent handles voice queries?
   - Recommendation: For Phase 22 scope, fix LLM to Claude via `VOICE_AGENT_MODEL` env var. Defer dynamic routing.

2. **Gemini Live user transcript reliability in 1.0.0**
   - What we know: Issue #3350 documents missing user transcription
   - What's unclear: Whether 1.0.0 fixed this
   - Recommendation: Implement the `transcript_proc.user()` pattern as shown; add a fallback that reads user message from `LLMContext` at turn end.

3. **SQLITE_DB_PATH absolute path coordination**
   - What we know: Next.js uses `process.cwd()/data/conversations.db`; Python must use same path
   - What's unclear: Whether a root `.env` already exists or needs to be created
   - Recommendation: Wave 0 task: create `voice-server/.env` with `SQLITE_DB_PATH=$(pwd)/data/conversations.db` resolved to absolute path at setup time.

4. **Launch mechanism for the two Python processes**
   - What we know: Project uses LaunchAgent + `npm start` for Next.js (per memory)
   - What's unclear: Whether to add voice-server to LaunchAgent, use a Procfile, or launch manually
   - Recommendation: For Phase 22, document manual launch (`./voice-server/start.sh`). Production LaunchAgent integration is a follow-up.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.12 | Pipecat venv | ✓ | 3.12.12 | Use 3.13 |
| Python 3.13 | Pipecat venv (alt) | ✓ | 3.13.12 | Use 3.12 |
| Python 3.14 | — (DO NOT USE) | ✓ | 3.14.2 | Excluded — no wheels |
| uv | Python package mgr | ✓ | 0.11.2 | pip3 |
| npm | Dashboard packages | ✓ | (with Node) | — |
| GOOGLE_API_KEY | Gemini Live | Not verified | — | Cascade-only fallback |
| GROQ_API_KEY | GroqSTTService | Not verified | — | WhisperSTTServiceMLX (local) |
| CARTESIA_API_KEY | CartesiaTTSService | Not verified | — | ElevenLabs → Kokoro (local) |
| Port 7860 | WebsocketServerTransport | Not checked | — | Change port via env var |
| Port 7861 | FastAPI /health | Not checked | — | Change port via env var |

**Missing dependencies with no fallback:**
- At least one API key pair (STT + TTS) must be set for the service to process audio. Wave 0 must include a `.env` setup step.

**Missing dependencies with fallback:**
- All API services have a local offline fallback chain. Service can run with zero API keys using WhisperSTTServiceMLX + KokoroTTSService.

---

## Validation Architecture

> `nyquist_validation` key absent from `.planning/config.json` — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework (JS) | Vitest (existing) |
| Framework (Python) | pytest + pytest-asyncio (Wave 0) |
| Config file (Python) | `voice-server/pytest.ini` (Wave 0) |
| Quick run command | `cd voice-server && python -m pytest tests/ -x` |
| Full suite command | `npx vitest run && cd voice-server && python -m pytest tests/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VOICE-01 | `/health` returns JSON with `active` field | smoke | `cd voice-server && python -m pytest tests/test_health.py -x` | ❌ Wave 0 |
| VOICE-02 | GeminiLiveLLMService instantiates without error | unit | `cd voice-server && python -m pytest tests/test_pipeline_gemini.py -x` | ❌ Wave 0 |
| VOICE-03 | FallbackTTSService tries next provider on exception | unit | `cd voice-server && python -m pytest tests/test_fallback_tts.py -x` | ❌ Wave 0 |
| VOICE-04 | TranscriptWriter inserts row into messages table | unit | `cd voice-server && python -m pytest tests/test_transcript_writer.py -x` | ❌ Wave 0 |
| VOICE-05 | `/api/voice-status` returns 200 with active field | integration | `npx vitest run src/app/api/voice-status` | ❌ Wave 0 |
| DASH-04 | VoicePanel renders active/inactive state | unit | `npx vitest run src/components/voice` | ❌ Wave 0 |

### Wave 0 Gaps

- [ ] `voice-server/pytest.ini` — framework config
- [ ] `voice-server/tests/conftest.py` — in-memory SQLite fixture for TranscriptWriter
- [ ] `voice-server/tests/test_health.py` — VOICE-01 smoke
- [ ] `voice-server/tests/test_pipeline_gemini.py` — VOICE-02 unit (mock GeminiLiveLLMService)
- [ ] `voice-server/tests/test_fallback_tts.py` — VOICE-03 unit (FallbackTTSService exception routing)
- [ ] `voice-server/tests/test_transcript_writer.py` — VOICE-04 unit (in-memory SQLite)
- [ ] `src/app/api/voice-status/__tests__/route.test.ts` — VOICE-05
- [ ] `src/components/voice/__tests__/VoicePanel.test.tsx` — DASH-04
- [ ] Framework install: `cd voice-server && uv pip install pytest pytest-asyncio`

---

## Security Domain

> `security_enforcement` not set to false — section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Single-user local tool; localhost ports need no auth |
| V3 Session Management | Yes | Session IDs as UUID4; no persistent tokens; one session at a time |
| V4 Access Control | No | Single-user; dashboard runs on same machine |
| V5 Input Validation | Yes | Parameterized queries in TranscriptWriter (shown in Pattern 6) |
| V6 Cryptography | No | No encryption needed for localhost voice traffic |

### Known Threat Patterns for Pipecat + SQLite

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via transcript content | Tampering | Parameterized queries — all `?` placeholders, never string concatenation |
| Prompt injection via user voice | Tampering | System instruction hardening; Gemini/Groq process audio not raw text |
| Unbounded session duration | Denial of Service | `session_timeout=` param on `WebsocketServerParams` |
| Voice service port exposure | Information Disclosure | Bind to `127.0.0.1` not `0.0.0.0` for production; `0.0.0.0` only if needed for LAN testing |

---

## Sources

### Primary (HIGH confidence)
- [docs.pipecat.ai/server/services/s2s/gemini-live](https://docs.pipecat.ai/server/services/s2s/gemini-live) — GeminiLiveLLMService config, model IDs, voice options, VAD, TEXT modality limitation
- [docs.pipecat.ai/server/services/stt/groq](https://docs.pipecat.ai/server/services/stt/groq) — GroqSTTService import, Settings, VAD integration, model "whisper-large-v3-turbo"
- [docs.pipecat.ai/server/services/transport/websocket-server](https://docs.pipecat.ai/server/services/transport/websocket-server) — `WebsocketServerTransport(host=, port=)` constructor; one-client limit; event handlers
- [docs.pipecat.ai/client/js/transports/websocket](https://docs.pipecat.ai/client/js/transports/websocket) — PipecatClient + WebSocketTransport + ProtobufFrameSerializer browser usage
- [docs.pipecat.ai/guides/learn/pipeline](https://docs.pipecat.ai/guides/learn/pipeline) — Pipeline, PipelineTask, PipelineRunner
- [pypi.org/project/pipecat-ai](https://pypi.org/project/pipecat-ai/) — Version 1.0.0, Python >=3.11, extras
- `pip3 index versions pipecat-ai` → 1.0.0 [VERIFIED: registry 2026-04-17]
- `npm view @pipecat-ai/client-js version` → 1.7.0 [VERIFIED: registry 2026-04-17]
- `npm view @pipecat-ai/websocket-transport version` → 1.6.2 [VERIFIED: registry 2026-04-17]
- `src/lib/db.ts` — WAL + busy_timeout=5000 confirmed [VERIFIED: codebase]
- `src/lib/db-schema.ts` — messages_ai FTS5 trigger confirmed [VERIFIED: codebase]
- `src/lib/constants.ts` — SQLITE_DB_PATH default confirmed [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- [github.com/pipecat-ai/pipecat/releases/tag/v1.0.0](https://github.com/pipecat-ai/pipecat/releases/tag/v1.0.0) — 1.0.0 breaking changes: import reorganization, `LLMContext` unification, removed deprecated APIs
- CartesiaTTSService Settings API, model "sonic-3", default API version "2025-04-16" — from WebSearch cross-referenced with PyPI
- `TranscriptProcessor` factory pattern (`.user()`, `.assistant()`) — from search results and community docs

### Tertiary (LOW confidence — flagged)
- `FallbackTTSService` pattern — no official docs; inferred from `TTSService` base class architecture [ASSUMED A1]
- `TranscriptMessage.content` field name — found in search but not directly verified in 1.0.0 docs [ASSUMED A5]
- `GradiumTTSService` import path — found in changelog notes, not verified in 1.0.0 module structure [ASSUMED A7]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified via pip and npm registries
- Architecture patterns: HIGH — core patterns from official docs; FallbackTTSService is ASSUMED custom code
- Pitfalls: HIGH — Python 3.14 wheel gap verified, import paths from release notes, single-client from docs, WAL from codebase
- Cascade fallback chain: MEDIUM — individual services verified; chain composition and field names have ASSUMED items

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 days — stable framework; Pipecat actively developed, new releases may add features)
