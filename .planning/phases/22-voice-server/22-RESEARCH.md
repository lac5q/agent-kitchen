# Phase 22: Voice Server - Research

**Researched:** 2026-04-17
**Domain:** Pipecat Python voice service, Gemini Live, STT/TTS cascade, SQLite transcript storage, dashboard voice panel
**Confidence:** HIGH (core Pipecat APIs verified via official docs and PyPI registry; fallback chain custom code identified)

---

## Summary

Phase 22 adds a standalone Python voice service using Pipecat 1.0.0 (released 2026-04-14). The service runs in a dedicated directory (`voice-server/`) alongside the Next.js app and exposes a WebSocket endpoint on port 7860. Two voice modes are supported: Gemini Live (speech-to-speech, low latency) and a cascade fallback (Groq Whisper STT → Claude/agent LLM → Cartesia TTS, with deeper offline fallbacks). Every utterance is written as a `messages` row to the existing shared SQLite database (`data/conversations.db`) so it appears in `/api/recall`. The dashboard voice panel (DASH-04) polls a thin `/health` HTTP endpoint on the Python service and reads transcripts from the existing `/api/recall` route.

The most significant sharp edge is **Pipecat 1.0.0 import path reorganization** — all 0.0.x import paths are broken. All code in this phase must use the new fully-qualified submodule imports. The second sharp edge is **Python version**: the system default is 3.14 but pipecat's binary dependencies (faster-whisper, kokoro-onnx) do not yet have 3.14 wheels. The venv must be pinned to Python 3.12 or 3.13, both of which are installed at `/opt/homebrew/bin/python3.12` and `/opt/homebrew/bin/python3.13`.

**Primary recommendation:** Use `WebsocketServerTransport` on port 7860 with a FastAPI wrapper that also serves a `/health` JSON endpoint. Transcript persistence goes directly to SQLite via Python `sqlite3` (same file, WAL mode already set by the Next.js process). The dashboard voice panel uses `@pipecat-ai/websocket-transport@1.6.2` and `@pipecat-ai/client-js@1.7.0` for the mic connection, plus polling `/api/voice-status` (a thin Next.js proxy to the Python `/health` endpoint).

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VOICE-01 | Pipecat Python service runs on a dedicated port with WebSocket transport to the dashboard | WebsocketServerTransport on port 7860; FastAPI serves both audio WS and /health |
| VOICE-02 | Gemini Live mode: speech-to-speech, low latency, routed to active agent | GeminiLiveLLMService with Settings(model="models/gemini-2.5-flash-native-audio-preview-12-2025"); no STT/TTS needed — Gemini handles both |
| VOICE-03 | Cascade mode: Groq Whisper STT → Cartesia TTS with defined fallback chain | GroqSTTService → CartesiaTTSService → ElevenLabsTTSService → GradiumTTSService → KokoroTTSService (local) → custom SubprocessTTSService(say); WhisperSTTServiceMLX as STT fallback |
| VOICE-04 | All voice session transcripts written to SQLite conversation store, searchable via SQLDB-01 | TranscriptProcessor.on_transcript_update writes to messages table; same WAL-mode SQLite file |
| VOICE-05 | Dashboard shows active voice session status and scrollable transcript log | PipecatClient + WebSocketTransport from @pipecat-ai packages; /api/voice-status proxy; transcript from /api/recall?q= |
| DASH-04 | Voice session log in dashboard: active/inactive indicator, last session duration, scrollable transcript | VoicePanel component polling /api/voice-status; useVoiceTranscript() hook using /api/recall |
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
| pipecat-ai[websocket] | 1.0.0 | WebsocketServerTransport | Dashboard communication |
| fastapi | ^0.115 | HTTP wrapper for /health endpoint | Thin HTTP alongside WS |
| uvicorn | ^0.32 | ASGI server | Runs FastAPI |
| python-dotenv | ^1.0 | Load .env with API keys | Standard pattern |

#### Kokoro Local TTS (deeper fallback)
```
pipecat-ai[kokoro]
```
KokoroTTSService uses kokoro-onnx engine — runs entirely locally, no API key. [VERIFIED: PyPI pipecat-ai extras]

### Core — Dashboard Client (Next.js)

| Package | Version | Purpose |
|---------|---------|---------|
| @pipecat-ai/client-js | 1.7.0 | PipecatClient browser SDK |
| @pipecat-ai/websocket-transport | 1.6.2 | Browser WebSocket transport to Pipecat |

**Version verification:** [VERIFIED: npm registry 2026-04-17]
```bash
npm view @pipecat-ai/client-js version        # 1.7.0
npm view @pipecat-ai/websocket-transport version  # 1.6.2
```

### Installation

```bash
# Python service (in voice-server/ subdirectory)
# CRITICAL: use python3.12 or python3.13, NOT 3.14
uv venv --python python3.12 .venv
source .venv/bin/activate
uv pip install "pipecat-ai[google,groq,cartesia,elevenlabs,websocket,kokoro]" fastapi uvicorn python-dotenv

# Next.js dashboard additions
npm install @pipecat-ai/client-js @pipecat-ai/websocket-transport
```

---

## Architecture Patterns

### Project Structure

```
voice-server/                    # Standalone Python service (NOT in src/)
├── .venv/                       # Python 3.12 virtual env
├── .env                         # GOOGLE_API_KEY, GROQ_API_KEY, CARTESIA_API_KEY, etc.
├── requirements.txt             # Pinned versions for reproducibility
├── server.py                    # FastAPI app + Pipecat entrypoint
├── pipeline_gemini.py           # GeminiLiveLLMService pipeline
├── pipeline_cascade.py          # GroqSTT → LLM → CartesiaTTS pipeline
├── transcript_writer.py         # SQLite transcript persistence
└── fallback_tts.py              # FallbackTTSService wrapper

src/
├── app/api/
│   └── voice-status/route.ts    # Proxy to Python /health (DASH-04)
└── components/
    └── voice/
        ├── VoicePanel.tsx        # DASH-04 panel: status, duration, transcript
        └── useVoiceTranscript.ts # Hook: polls /api/recall?q=voice_session:*
```

### Pattern 1: Server Architecture (FastAPI + WebsocketServerTransport)

**What:** A single FastAPI process serves:
1. `GET /health` — JSON status: `{ active, mode, session_id, started_at, duration_secs }`
2. `WebSocket /ws` — Pipecat audio transport for the active voice session

**Why:** `WebsocketServerTransport` only supports one client at a time (confirmed in docs). The Next.js dashboard voice panel connects once per session. HTTP `/health` is polled independently.

```python
# Source: docs.pipecat.ai/server/services/transport/websocket-server + verified pattern
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket
import uvicorn
from pipecat.transports.network.websocket_server import (
    WebsocketServerTransport,
    WebsocketServerParams,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask
from pipecat.pipeline.runner import PipelineRunner

session_state = {"active": False, "mode": None, "session_id": None, "started_at": None}

app = FastAPI()

@app.get("/health")
async def health():
    duration = None
    if session_state["started_at"]:
        from datetime import datetime, timezone
        started = datetime.fromisoformat(session_state["started_at"])
        duration = int((datetime.now(timezone.utc) - started).total_seconds())
    return {**session_state, "duration_secs": duration}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    transport = WebsocketServerTransport(
        websocket=websocket,
        params=WebsocketServerParams(audio_out_enabled=True),
    )
    await run_pipeline(transport)  # builds and runs the active mode pipeline
```

### Pattern 2: Gemini Live Pipeline (VOICE-02)

**What:** Single-service speech-to-speech pipeline. No separate STT or TTS — Gemini Live handles both. [VERIFIED: docs.pipecat.ai/server/services/s2s/gemini-live]

**Sharp edge:** `TEXT` modality is not supported by recent Gemini Live models. Voice only.

```python
# Source: docs.pipecat.ai/server/services/s2s/gemini-live
import os
from pipecat.services.google.gemini_live import (
    GeminiLiveLLMService,
    GeminiVADParams,
)
from pipecat.processors.aggregators.openai_llm_context import LLMContext

llm = GeminiLiveLLMService(
    api_key=os.getenv("GOOGLE_API_KEY"),
    settings=GeminiLiveLLMService.Settings(
        model="models/gemini-2.5-flash-native-audio-preview-12-2025",
        system_instruction="You are a helpful kitchen assistant.",
        voice="Puck",
        vad=GeminiVADParams(silence_duration_ms=500),
    ),
)

context = LLMContext()
context_aggregator = llm.create_context_aggregator(context)

pipeline = Pipeline([
    transport.input(),
    context_aggregator.user(),
    llm,
    transport.output(),
    context_aggregator.assistant(),
])
```

**Critical note on import path (Pipecat 1.0.0):**
- OLD (broken): `from pipecat.services.gemini_multimodal_live.gemini import GeminiMultimodalLiveLLMService`
- NEW (correct): `from pipecat.services.google.gemini_live import GeminiLiveLLMService`

### Pattern 3: Cascade Pipeline (VOICE-03)

**What:** Standard STT → LLM → TTS pipeline with a custom FallbackTTSService wrapper.

```python
# Source: docs.pipecat.ai/server/services/stt/groq + docs.pipecat.ai/server/services/tts/cartesia
import os
from pipecat.services.groq.stt import GroqSTTService
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.services.openai.llm import OpenAILLMService  # or your agent LLM
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.processors.aggregators.openai_llm_context import LLMContext

stt = GroqSTTService(
    api_key=os.getenv("GROQ_API_KEY"),
    settings=GroqSTTService.Settings(
        model="whisper-large-v3-turbo",
        language=None,  # auto-detect
    ),
)

tts = CartesiaTTSService(
    api_key=os.getenv("CARTESIA_API_KEY"),
    settings=CartesiaTTSService.Settings(
        voice="your-voice-id",
        model="sonic-3",
    ),
)

pipeline = Pipeline([
    transport.input(),
    SileroVADAnalyzer(),
    stt,
    context_aggregator.user(),
    llm,
    tts,                      # replace with FallbackTTSService (see below)
    transport.output(),
    context_aggregator.assistant(),
])
```

**1.0.0 import paths:**
- `from pipecat.services.groq.stt import GroqSTTService`
- `from pipecat.services.cartesia.tts import CartesiaTTSService`
- `from pipecat.services.elevenlabs.tts import ElevenLabsTTSService`

### Pattern 4: FallbackTTSService (custom — VOICE-03 chain)

Pipecat has no built-in fallback chaining. This is ~40 lines of custom code. [ASSUMED: no official fallback chain documented; KokoroTTSService and custom subprocess verified as individual services]

```python
# voice-server/fallback_tts.py
import asyncio
import subprocess
from pipecat.services.tts_service import TTSService

class FallbackTTSService(TTSService):
    """Tries providers in order, falls through on failure."""

    def __init__(self, providers: list[TTSService], **kwargs):
        super().__init__(**kwargs)
        self._providers = providers
        self._active_idx = 0

    async def run_tts(self, text: str):
        for i, provider in enumerate(self._providers[self._active_idx:], start=self._active_idx):
            try:
                async for chunk in provider.run_tts(text):
                    yield chunk
                return
            except Exception as e:
                self._logger.warning(f"TTS provider {i} failed: {e}, trying next")
                self._active_idx = i + 1
        # All providers failed — use macOS say as absolute last resort
        await self._say_fallback(text)

    async def _say_fallback(self, text: str):
        # macOS only — runs synchronously in thread to avoid blocking event loop
        await asyncio.to_thread(
            subprocess.run, ["say", text], check=False
        )
        # No audio frames emitted — silence on non-macOS
```

**TTS fallback chain order (VOICE-03):**
1. `CartesiaTTSService` — primary, sonic-3 model
2. `ElevenLabsTTSService` — first cloud fallback
3. `GradiumTTSService` — second cloud fallback
4. `KokoroTTSService` — local offline fallback (kokoro-onnx, no API key)
5. macOS `say` subprocess — absolute last resort (macOS only, no audio frames)

**STT fallback chain (VOICE-03):**
1. `GroqSTTService` — primary
2. `WhisperSTTServiceMLX` — local offline fallback, Apple Silicon optimized

```python
# voice-server/fallback_stt.py  [ASSUMED pattern — implement similarly to FallbackTTSService]
from pipecat.services.groq.stt import GroqSTTService
from pipecat.services.whisper.stt import WhisperSTTServiceMLX  # Apple Silicon
```

### Pattern 5: Transcript Persistence (VOICE-04)

**What:** TranscriptProcessor intercepts all turns and writes to the existing `messages` table.

The SQLite file is at `data/conversations.db` (from `SQLITE_DB_PATH` env var or default). The Python service must reference the **same absolute path** as the Next.js process. Use the `SQLITE_DB_PATH` environment variable shared via `.env` in the project root.

WAL mode and busy_timeout = 5000ms are already set by the Next.js `db.ts` process. Python's `sqlite3` module respects these pragmas but must SET them itself on connect. [VERIFIED: src/lib/db.ts lines 18-20]

```python
# voice-server/transcript_writer.py
import sqlite3
import uuid
from datetime import datetime, timezone

class TranscriptWriter:
    def __init__(self, db_path: str, session_id: str):
        self.db_path = db_path
        self.session_id = session_id

    def write(self, role: str, content: str) -> None:
        """Writes a single turn to the messages table."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=5000")
            conn.execute("""
                INSERT OR IGNORE INTO messages
                  (session_id, project, agent_id, role, content, timestamp, request_id)
                VALUES (?, 'agent-kitchen', 'voice', ?, ?, ?, ?)
            """, (
                self.session_id,
                role,
                content,
                datetime.now(timezone.utc).isoformat(),
                str(uuid.uuid4()),
            ))
```

**Wire into pipeline via TranscriptProcessor callback:**

```python
from pipecat.processors.transcript_processor import TranscriptProcessor

transcript_proc = TranscriptProcessor()
writer = TranscriptWriter(db_path=os.getenv("SQLITE_DB_PATH", "data/conversations.db"),
                          session_id=session_id)

@transcript_proc.event_handler("on_transcript_update")
async def on_transcript_update(processor, frame, direction):
    # frame has .role ("user"|"assistant") and .text
    writer.write(frame.role, frame.text)

# Add to cascade pipeline (not Gemini — Gemini Live exposes its own transcript events)
pipeline = Pipeline([
    transport.input(),
    stt,
    transcript_proc,           # after STT for user turns
    context_aggregator.user(),
    llm,
    tts,
    transcript_proc,           # after TTS for assistant turns (same processor, different direction)
    transport.output(),
    context_aggregator.assistant(),
])
```

**Note on Gemini Live transcripts:** GeminiLiveLLMService does not surface user transcriptions reliably in some versions. Issue #3350 on GitHub documents this. Use a custom `on_transcript_update` event from the LLM context aggregator as a supplement. [CITED: github.com/pipecat-ai/pipecat/issues/3350]

### Pattern 6: Dashboard Voice Panel (VOICE-05, DASH-04)

**Two separate data flows:**

1. **Status/control:** Next.js `/api/voice-status/route.ts` proxies to Python `/health`. VoicePanel polls every 2 seconds.
2. **Microphone connection:** `PipecatClient` + `WebSocketTransport` connects directly to `ws://localhost:7860/ws`.
3. **Transcript display:** `useVoiceTranscript()` hook calls `/api/recall?q=` filtered by session_id tag.

```typescript
// src/app/api/voice-status/route.ts
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const res = await fetch('http://localhost:7860/health', { cache: 'no-store' });
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({ active: false, error: 'voice server unavailable' });
  }
}
```

```typescript
// src/components/voice/VoicePanel.tsx - conceptual shape
// Source: docs.pipecat.ai/client/js/transports/websocket
import { PipecatClient } from '@pipecat-ai/client-js';
import { WebSocketTransport, ProtobufFrameSerializer } from '@pipecat-ai/websocket-transport';

const pcClient = new PipecatClient({
  transport: new WebSocketTransport({
    serializer: new ProtobufFrameSerializer(),
    recorderSampleRate: 16000,
    playerSampleRate: 16000,
  }),
  enableMic: true,
  enableCam: false,
});

await pcClient.connect({ wsUrl: 'ws://localhost:7860/ws' });
```

### Anti-Patterns to Avoid

- **Embedding Pipecat in Next.js:** Pipecat is Python; it is a separate process. Never import it in TypeScript.
- **Using Python 3.14:** Binary wheels for faster-whisper and kokoro-onnx do not exist for 3.14. Pin to 3.12.
- **Old 0.0.x import paths:** `from pipecat.services.gemini_multimodal_live.gemini import ...` is removed in 1.0.0. Use fully-qualified new paths.
- **Using `WebsocketServerTransport` for the status API:** It only handles audio frames. HTTP `/health` must be a separate FastAPI route.
- **Direct Qdrant writes from voice service:** Per project constraint in PROJECT.md, mem0 collection writes go via HTTP API only.
- **Shared SQLite without WAL:** Next.js already sets WAL + busy_timeout=5000. Python must also set these pragmas on every connection.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Voice pipeline orchestration | Custom frame routing | Pipecat Pipeline + PipelineTask | Handles concurrency, backpressure, interruption |
| Gemini Live session management | Raw WebSocket to Google | GeminiLiveLLMService | Handles reconnection (3 attempts), turn_complete race, VAD |
| Browser audio recording | Custom MediaRecorder | @pipecat-ai/websocket-transport | Handles sample rate, PCM encoding, bidirectional frames |
| VAD (voice activity detection) | Energy threshold detector | SileroVADAnalyzer (built-in) or Gemini server-side VAD | Silero is battle-tested, low false positives |
| Transcript normalization | String parsing of LLM output | TranscriptProcessor | Already handles role attribution, chunked Gemini output aggregation |

---

## Common Pitfalls

### Pitfall 1: Python 3.14 Binary Wheel Gap
**What goes wrong:** `pip install pipecat-ai[kokoro]` fails because kokoro-onnx has no 3.14 wheel.
**Why it happens:** Python 3.14 was released weeks ago; the scientific Python ecosystem is still catching up.
**How to avoid:** `uv venv --python python3.12 .venv` in `voice-server/`. Both 3.12 and 3.13 are installed at `/opt/homebrew/bin/`.
**Warning signs:** `ERROR: Could not find a version that satisfies the requirement faster-whisper`

### Pitfall 2: Pipecat 1.0.0 Import Path Breakage
**What goes wrong:** Any code copying examples from the web will use 0.0.x import paths and fail with `ImportError`.
**Why it happens:** 1.0.0 reorganized all service imports into submodules. The old flat imports were removed.
**How to avoid:** Use the new import paths listed in Pattern 2 and Pattern 3 above. Run `python -c "from pipecat.services.google.gemini_live import GeminiLiveLLMService"` to verify after install.
**Warning signs:** `ImportError: cannot import name 'GeminiMultimodalLiveLLMService' from 'pipecat.services.gemini_multimodal_live'`

### Pitfall 3: WebSocket Transport — One Client Limit
**What goes wrong:** Opening a second browser tab or reconnecting without disconnect causes the Python service to close the first connection.
**Why it happens:** `WebsocketServerTransport` explicitly enforces single-client. [VERIFIED: docs.pipecat.ai/server/services/transport/websocket-server]
**How to avoid:** Handle `on_client_disconnected` in the transport to clean up session state. Disable the "Connect" button in the dashboard while a session is active.
**Warning signs:** Mysterious disconnections; transcript cuts off mid-session.

### Pitfall 4: Gemini Live TEXT Modality Error
**What goes wrong:** Setting `modalities=["TEXT", "AUDIO"]` causes an error on current Gemini Live models.
**Why it happens:** Recent Gemini Live models dropped TEXT modality. [VERIFIED: docs.pipecat.ai/server/services/s2s/gemini-live — "TEXT modality may not be supported"]
**How to avoid:** Use voice-only mode. For transcript extraction, rely on GeminiLiveLLMService's built-in user transcription chunking + `on_transcript_update`.

### Pitfall 5: SQLite Cross-Process Write Conflicts
**What goes wrong:** Python transcript writes blocked or corrupted by Next.js reads.
**Why it happens:** SQLite allows multiple readers but needs proper locking for cross-process writes.
**How to avoid:** Python service must set `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` on every connection (since it doesn't use the Next.js singleton). Already safe when both sides use WAL. [VERIFIED: src/lib/db.ts — WAL + busy_timeout=5000 confirmed]

### Pitfall 6: Gemini Live User Transcription Missing
**What goes wrong:** User speech turns appear empty in the transcript log; only assistant turns captured.
**Why it happens:** Known issue in some Pipecat versions: GeminiLiveLLMService does not always return user transcription frames. [CITED: github.com/pipecat-ai/pipecat/issues/3350]
**How to avoid:** Add `TranscriptProcessor` after the transport input to capture raw `TranscriptionFrame` data from Gemini's partial transcriptions. Supplement with `on_transcript_update` from the context aggregator.

### Pitfall 7: Cascade Mode LLM — Routing to "Active Agent"
**What goes wrong:** Requirements say voice routes to "the active agent" but there's no defined protocol for selecting which agent handles the request.
**Why it happens:** The hive mind coordination (Phase 20) tracks agents but has no concept of "voice-active" agent.
**How to avoid:** For Phase 22 scope, use a fixed LLM (Claude via Anthropic API or OpenAI). Add a simple env var `VOICE_AGENT_MODEL` to allow override. Agent routing can be a Phase 25+ enhancement.

---

## Code Examples

### Complete Minimal Gemini Live Server

```python
# voice-server/server.py
# Source: Assembled from docs.pipecat.ai verified patterns
import asyncio, os, uuid
from datetime import datetime, timezone
from fastapi import FastAPI, WebSocket
import uvicorn
from dotenv import load_dotenv

from pipecat.transports.network.websocket_server import (
    WebsocketServerTransport, WebsocketServerParams,
)
from pipecat.services.google.gemini_live import GeminiLiveLLMService, GeminiVADParams
from pipecat.processors.aggregators.openai_llm_context import LLMContext
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask
from pipecat.pipeline.runner import PipelineRunner

load_dotenv()

app = FastAPI()
_state = {"active": False, "mode": None, "session_id": None, "started_at": None}

@app.get("/health")
async def health():
    duration = None
    if _state["started_at"]:
        delta = datetime.now(timezone.utc) - datetime.fromisoformat(_state["started_at"])
        duration = int(delta.total_seconds())
    return {**_state, "duration_secs": duration}

@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    session_id = str(uuid.uuid4())
    _state.update(active=True, mode="gemini", session_id=session_id,
                  started_at=datetime.now(timezone.utc).isoformat())
    try:
        transport = WebsocketServerTransport(
            websocket=websocket,
            params=WebsocketServerParams(audio_out_enabled=True),
        )
        llm = GeminiLiveLLMService(
            api_key=os.getenv("GOOGLE_API_KEY"),
            settings=GeminiLiveLLMService.Settings(
                model="models/gemini-2.5-flash-native-audio-preview-12-2025",
                system_instruction="You are a helpful kitchen assistant.",
                voice="Puck",
                vad=GeminiVADParams(silence_duration_ms=500),
            ),
        )
        context = LLMContext()
        agg = llm.create_context_aggregator(context)
        pipeline = Pipeline([
            transport.input(), agg.user(), llm, transport.output(), agg.assistant(),
        ])
        task = PipelineTask(pipeline)
        runner = PipelineRunner(handle_sigint=False)
        await runner.run(task)
    finally:
        _state.update(active=False, session_id=None, started_at=None)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)
```

### TranscriptProcessor Callback Pattern

```python
# Source: reference-server.pipecat.ai/en/latest/api/pipecat.processors.transcript_processor
from pipecat.processors.transcript_processor import TranscriptProcessor

transcript_proc = TranscriptProcessor()

@transcript_proc.event_handler("on_transcript_update")
async def save_transcript(processor, frame, direction):
    writer.write(role=frame.role, content=frame.text)
```

### Browser Connect (TypeScript)

```typescript
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

await client.connect({ wsUrl: 'ws://localhost:7860/ws' });
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `GeminiMultimodalLiveLLMService` | `GeminiLiveLLMService` | Pipecat 1.0.0 (2026-04-14) | All old imports broken |
| Flat imports (`from pipecat.services.groq import ...`) | Submodule imports (`from pipecat.services.groq.stt import ...`) | Pipecat 1.0.0 | Every example on the web is outdated |
| `voice_id` / `model` constructor params | `Settings(voice=..., model=...)` | Deprecated since 0.0.105, removed 1.0.0 | Constructor signature changed |
| `OpenAILLMContext` | `LLMContext` (unified) | Pipecat 1.0.0 | Context creation simplified |
| Gemini model `gemini-2.0-flash-live-001` | `models/gemini-2.5-flash-native-audio-preview-12-2025` | Early 2026 | Audio quality significantly improved |
| `kokoro` engine | `kokoro-onnx` engine | Recent | KokoroTTSService backend changed |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | FallbackTTSService must be custom code; Pipecat has no built-in TTS fallback chaining | Don't Hand-Roll, Pattern 4 | If a built-in exists, saves ~40 lines; low risk |
| A2 | macOS `say` command produces no audio frames in Pipecat (silence on non-macOS) | Pattern 4 | Could silently fail instead of speaking; test on macOS |
| A3 | Cascade mode routes to Claude via Anthropic API using a fixed model (not runtime agent selection) | Pitfall 7 | If "active agent" routing is required in Phase 22, significant scope expansion |
| A4 | `WhisperSTTServiceMLX` import path in 1.0.0 is `pipecat.services.whisper.stt` | Pattern 3 | ImportError; verify at install time |
| A5 | TranscriptProcessor `on_transcript_update` frame has `.role` and `.text` fields | Pattern 5 | Wrong field names cause AttributeError; verify against live docs |

---

## Open Questions

1. **"Active agent" routing scope**
   - What we know: Phase 20 hive mind tracks agents; VOICE-02/03 say "routed to the active agent"
   - What's unclear: Is there a protocol for selecting which agent receives the voice query? Does it forward text to a different Claude session?
   - Recommendation: For Phase 22, fix the LLM to Claude (via `VOICE_AGENT_MODEL` env var). Defer dynamic routing.

2. **Gemini Live user transcript reliability**
   - What we know: Issue #3350 reports user transcription missing in some builds
   - What's unclear: Is this fixed in 1.0.0?
   - Recommendation: Plan a fallback: if `TranscriptionFrame` is empty, log the transcript from context aggregator turn boundaries.

3. **Production SQLITE_DB_PATH alignment**
   - What we know: Next.js uses `process.cwd()/data/conversations.db`; Python must use same path
   - What's unclear: The production cwd for the Python process (launched from project root vs `voice-server/`)
   - Recommendation: Declare `SQLITE_DB_PATH` as an absolute path in the root `.env` shared by both processes.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.12 | Pipecat venv | ✓ | 3.12.12 | Use 3.13 |
| Python 3.13 | Pipecat venv (alt) | ✓ | 3.13.12 | Use 3.12 |
| Python 3.14 | — (DO NOT USE) | ✓ | 3.14.2 | n/a — excluded |
| uv | Python package mgr | ✓ | 0.11.2 | pip3 |
| npm | Dashboard packages | ✓ | included with Node | — |
| GOOGLE_API_KEY | Gemini Live | Not verified | — | Groq cascade only |
| GROQ_API_KEY | GroqSTTService | Not verified | — | WhisperSTTServiceMLX |
| CARTESIA_API_KEY | CartesiaTTSService | Not verified | — | ElevenLabs |

**Missing dependencies with no fallback:**
- API keys (GOOGLE_API_KEY, GROQ_API_KEY, CARTESIA_API_KEY) — planner must include a Wave 0 `.env` setup step. Without at least one working STT+TTS pair, the service cannot function.

**Missing dependencies with fallback:**
- If GROQ_API_KEY absent: fall through to WhisperSTTServiceMLX (local, Apple Silicon)
- If CARTESIA_API_KEY absent: fall through to KokoroTTSService (local, kokoro-onnx)

---

## Validation Architecture

> `workflow.nyquist_validation` key absent from config.json — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (existing, configured) for Next.js; pytest for Python service |
| Config file | `vitest.config.ts` (existing); `voice-server/pytest.ini` (Wave 0) |
| Quick run command (JS) | `npx vitest run src/app/api/voice-status` |
| Quick run command (Py) | `cd voice-server && python -m pytest tests/ -x` |
| Full suite command | `npx vitest run && cd voice-server && python -m pytest tests/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VOICE-01 | Python service starts and /health returns JSON | smoke | `cd voice-server && python -m pytest tests/test_health.py -x` | ❌ Wave 0 |
| VOICE-02 | Gemini Live pipeline instantiates without error | unit | `cd voice-server && python -m pytest tests/test_pipeline_gemini.py -x` | ❌ Wave 0 |
| VOICE-03 | Cascade pipeline instantiates; FallbackTTSService tries next on error | unit | `cd voice-server && python -m pytest tests/test_fallback_tts.py -x` | ❌ Wave 0 |
| VOICE-04 | TranscriptWriter inserts row into messages table | unit | `cd voice-server && python -m pytest tests/test_transcript_writer.py -x` | ❌ Wave 0 |
| VOICE-05 | /api/voice-status returns 200 when Python service is running | integration | `npx vitest run src/app/api/voice-status/__tests__/` | ❌ Wave 0 |
| DASH-04 | VoicePanel renders with active/inactive state | unit | `npx vitest run src/components/voice/__tests__/` | ❌ Wave 0 |

### Wave 0 Gaps

- [ ] `voice-server/pytest.ini` — test framework config
- [ ] `voice-server/tests/conftest.py` — shared fixtures (in-memory SQLite for TranscriptWriter tests)
- [ ] `voice-server/tests/test_health.py` — VOICE-01
- [ ] `voice-server/tests/test_pipeline_gemini.py` — VOICE-02
- [ ] `voice-server/tests/test_fallback_tts.py` — VOICE-03
- [ ] `voice-server/tests/test_transcript_writer.py` — VOICE-04
- [ ] `src/app/api/voice-status/__tests__/route.test.ts` — VOICE-05
- [ ] `src/components/voice/__tests__/VoicePanel.test.tsx` — DASH-04
- [ ] Framework install: `cd voice-server && uv pip install pytest pytest-asyncio`

---

## Security Domain

> security_enforcement not set to false — included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Single-user local tool; no auth needed on localhost ports |
| V3 Session Management | Yes | Session IDs generated as UUID4; no persistent tokens |
| V4 Access Control | No | Single-user; dashboard runs on same machine |
| V5 Input Validation | Yes | Transcript content sanitized before SQLite insert (parameterized queries) |
| V6 Cryptography | No | No encryption needed for localhost voice traffic |

### Known Threat Patterns for Pipecat + SQLite

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via transcript content | Tampering | Parameterized queries in TranscriptWriter (already shown in pattern) |
| Prompt injection via user voice input | Tampering | System instruction hardening; Gemini/Groq process audio not text |
| Unbounded session duration (DoS) | Denial of Service | `session_timeout` param on WebsocketServerTransport |
| Transcript data leakage via /api/recall | Information Disclosure | /api/recall is local-only; no external exposure via Cloudflare tunnel needed |

---

## Sources

### Primary (HIGH confidence)
- [docs.pipecat.ai/server/services/s2s/gemini-live](https://docs.pipecat.ai/server/services/s2s/gemini-live) — Gemini Live configuration, model IDs, voice options, VAD, sharp edges
- [docs.pipecat.ai/server/services/stt/groq](https://docs.pipecat.ai/server/services/stt/groq) — GroqSTTService import path, Settings API, VAD integration
- [docs.pipecat.ai/server/services/transport/websocket-server](https://docs.pipecat.ai/server/services/transport/websocket-server) — WebsocketServerTransport params, single-client limit, event handlers
- [docs.pipecat.ai/client/js/transports/websocket](https://docs.pipecat.ai/client/js/transports/websocket) — PipecatClient + WebSocketTransport browser usage, ProtobufFrameSerializer
- [docs.pipecat.ai/guides/learn/pipeline](https://docs.pipecat.ai/guides/learn/pipeline) — Pipeline, PipelineTask, PipelineRunner pattern
- [pypi.org/project/pipecat-ai](https://pypi.org/project/pipecat-ai/) — Version 1.0.0, Python >=3.11, extras list
- `pip3 index versions pipecat-ai` — confirmed 1.0.0 is latest [VERIFIED: registry]
- `npm view @pipecat-ai/client-js version` → 1.7.0 [VERIFIED: registry]
- `npm view @pipecat-ai/websocket-transport version` → 1.6.2 [VERIFIED: registry]
- `src/lib/db.ts` — WAL mode + busy_timeout=5000 confirmed [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- [github.com/pipecat-ai/pipecat/releases/tag/v1.0.0](https://github.com/pipecat-ai/pipecat/releases/tag/v1.0.0) — 1.0.0 breaking changes: import reorganization, LLMContext unification, removed deprecated APIs
- CartesiaTTSService Settings API (model "sonic-3", default API version "2025-04-16") — from WebSearch cross-referenced with PyPI

### Tertiary (LOW confidence — flagged)
- FallbackTTSService pattern (custom wrapper) — no official docs; inferred from Pipecat TTSService base class architecture [ASSUMED]
- TranscriptProcessor `frame.role` / `frame.text` field names — found in search results, not directly verified from 1.0.0 docs [ASSUMED: A5]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified via pip and npm registries
- Architecture patterns: HIGH — core patterns from official docs; custom FallbackTTSService pattern is ASSUMED
- Pitfalls: HIGH — Python 3.14 wheel gap verified, import paths from release notes, single-client limit from docs
- Cascade fallback chain: MEDIUM — individual services verified; chain composition is custom code

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 days — stable framework; Pipecat active development may add features)
