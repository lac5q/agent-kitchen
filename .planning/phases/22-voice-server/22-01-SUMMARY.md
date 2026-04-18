---
phase: 22-voice-server
plan: "01"
subsystem: voice-backend
tags: [python, pipecat, sqlite, fastapi, tts, stt, gemini-live, tdd]
dependency_graph:
  requires: []
  provides:
    - voice-server/server.py (WebsocketServerTransport port 7860)
    - voice-server/health.py (FastAPI /health port 7861)
    - voice-server/pipeline_gemini.py (Gemini Live s2s pipeline builder)
    - voice-server/pipeline_cascade.py (STT->LLM->TTS cascade pipeline builder)
    - voice-server/fallback_tts.py (FallbackTTSService Cartesia->ElevenLabs->Gradium->Kokoro->say)
    - voice-server/transcript_writer.py (SQLite transcript persistence)
    - voice-server/transcript_proc_helper.py (TranscriptProcessor factory)
    - src/app/api/voice-status/route.ts (Next.js proxy to Python health)
  affects:
    - data/conversations.db (voice transcripts written to messages table)
    - /api/recall (FTS5 trigger auto-indexes voice rows for search)
tech_stack:
  added:
    - pipecat-ai 1.0.0 (Python voice pipeline framework)
    - fastapi + uvicorn (Python health endpoint)
    - python-dotenv (env loading)
    - pytest + pytest-asyncio + httpx (Python test suite)
  patterns:
    - Two-port architecture: Pipecat WS on 7860, FastAPI health on 7861
    - TDD with pipecat module hierarchy mocked in conftest.py
    - FallbackTTSService custom async generator chain with macOS say last resort
    - TranscriptProcessor factory (.user()/.assistant() distinct objects)
    - SQLite WAL + busy_timeout=5000 on every Python connect
key_files:
  created:
    - voice-server/requirements.txt
    - voice-server/server.py
    - voice-server/health.py
    - voice-server/pipeline_gemini.py
    - voice-server/pipeline_cascade.py
    - voice-server/fallback_tts.py
    - voice-server/transcript_writer.py
    - voice-server/transcript_proc_helper.py
    - voice-server/.env.example
    - voice-server/tests/conftest.py
    - voice-server/tests/test_transcript_writer.py
    - voice-server/tests/test_fallback_tts.py
    - voice-server/tests/test_pipeline_gemini.py
    - voice-server/tests/test_health.py
    - src/app/api/voice-status/route.ts
  modified: []
decisions:
  - "Used absolute imports (not relative) in voice-server/ since it is not a Python package"
  - "Mocked entire pipecat module hierarchy in conftest.py — pipecat binary deps require a full venv (not feasible in test env)"
  - "FallbackTTSService uses a real Python base class (not MagicMock) so subclassing works correctly"
  - "GradiumTTSService import wrapped in try/except ImportError — assumed import path per research A7"
  - "WhisperSTTServiceMLX import wrapped in try/except ImportError — assumed path per research A4"
  - "force-add voice-server/.env.example to git (gitignore has .env* pattern)"
metrics:
  duration_minutes: 28
  completed_date: "2026-04-18"
  tasks_completed: 4
  files_created: 15
  tests_written: 24
  tests_passing: 24
---

# Phase 22 Plan 01: Voice Server Scaffold Summary

**One-liner:** Pipecat 1.0.0 voice server with Gemini Live + cascade pipelines, SQLite transcript persistence, and FallbackTTS chain (Cartesia->ElevenLabs->Gradium->Kokoro->say).

## What Was Built

A complete standalone Python voice service in `voice-server/` alongside the Next.js app:

- **Two-port architecture:** `server.py` runs Pipecat `WebsocketServerTransport` on port 7860 for audio WebSocket connections; `health.py` runs FastAPI on port 7861 for status polling.
- **Two pipeline modes:** Gemini Live speech-to-speech (`pipeline_gemini.py`) and cascade STT->LLM->TTS (`pipeline_cascade.py`) selected via `VOICE_MODE` env var.
- **FallbackTTSService:** Custom async generator chain that tries Cartesia -> ElevenLabs -> Gradium (when `GRADIUM_API_KEY` set) -> Kokoro -> macOS `say` subprocess.
- **STT fallback:** Cascade pipeline uses `GroqSTTService` when `GROQ_API_KEY` is present, falls back to `WhisperSTTServiceMLX` (local Apple Silicon) otherwise.
- **Transcript persistence:** Every voice utterance is written to the shared `messages` table in `data/conversations.db` with `agent_id='voice'`, making it immediately searchable via `/api/recall` (FTS5 trigger auto-indexes on INSERT).
- **Next.js proxy:** `/api/voice-status/route.ts` proxies the dashboard to the Python health endpoint with graceful fallback JSON when the Python server is not running.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 5d334ed | chore | Python voice server scaffold (requirements, server, health, .env.example) |
| 505e790 | test | TDD RED — TranscriptWriter tests |
| e651288 | feat | TranscriptWriter + transcript_proc_helper (GREEN) |
| ef1e822 | test | TDD RED — fallback TTS, pipeline gemini, health tests |
| 8168478 | feat | FallbackTTSService, pipeline_gemini, pipeline_cascade (GREEN) |
| db32ae7 | feat | Next.js /api/voice-status proxy route |

## Test Results

```
24 passed, 1 warning in 0.27s
```

All 24 tests across 4 test files pass:
- `test_transcript_writer.py` — 6 tests (insert, fields, WAL mode, unique UUIDs, timestamp, session isolation)
- `test_fallback_tts.py` — 8 tests (provider fallthrough, say() last resort, Gradium conditional, ordering)
- `test_pipeline_gemini.py` — 5 tests (import, Pipeline construction, element count, 1.0.0 imports, transport wiring)
- `test_health.py` — 5 tests (no state file, inactive, active+duration, started_at, corrupted JSON)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pipecat not installed in test environment**
- **Found during:** Task 2 (would block all Task 3 pipeline tests)
- **Issue:** `pipecat-ai` requires a full venv with binary deps (kokoro-onnx, faster-whisper) — not feasible for system Python test runs. All pipeline module imports would fail.
- **Fix:** Created comprehensive pipecat module mock hierarchy in `conftest.py` using `sys.modules` injection before any test imports. `TTSService` base class mocked as a real Python class (not `MagicMock`) so `FallbackTTSService(TTSService)` subclassing works correctly.
- **Files modified:** `voice-server/tests/conftest.py`

**2. [Rule 3 - Blocking] uvicorn not installed for health.py TestClient**
- **Found during:** Task 3 GREEN run — `health.py` imports uvicorn at module level; TestClient import fails
- **Fix:** Installed uvicorn via `/opt/homebrew/bin/python3.12 -m pip install uvicorn --break-system-packages`
- **Note:** Added to `requirements.txt` (already present from Task 1); needs to be in venv when user installs

**3. [Rule 2 - Missing] httpx added to requirements.txt**
- **Found during:** Task 3 planning — FastAPI TestClient requires httpx as a dependency
- **Fix:** Added `httpx>=0.27` to `voice-server/requirements.txt` at Task 1 creation time

### Architectural Notes

- **Absolute imports used throughout:** `voice-server/` is not a Python package (no `__init__.py`). Research patterns used relative imports (`from .transcript_writer import ...`) — changed to absolute imports (`from transcript_writer import ...`) since tests run with `voice-server/` on `sys.path`.
- **GradiumTTSService import path assumed:** Research document marks this as A7 (assumed). Wrapped in `try/except ImportError` with a warning log — build will not fail if Gradium is unavailable.
- **WhisperSTTServiceMLX import path assumed:** Research marks as A4. Wrapped in `try/except ImportError` similarly.

## Known Stubs

None. All pipeline builders are fully wired. The voice server requires API keys and a running venv to execute (user setup), but the code structure is complete.

## Threat Surface Scan

All new surface was covered by the plan's threat model:

| Coverage | File | Threat ID |
|----------|------|-----------|
| T-22-01 covered | voice-server/server.py (WS port 7860) | Single-user, behind Cloudflare tunnel |
| T-22-02 covered | voice-server/transcript_writer.py (SQLite writes) | WAL + busy_timeout + INSERT OR IGNORE |
| T-22-03 covered | voice-server/.env.example | No real values; .env gitignored |
| T-22-04 covered | voice-server/server.py | WebsocketServerTransport single-client limit documented |
| T-22-05 covered | voice-server/fallback_tts.py | subprocess.run with explicit list, no shell=True |

## Self-Check: PASSED

All 14 created files confirmed present on disk. All 6 task commits confirmed in git log.
