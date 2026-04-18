# Phase 22: Voice Server — Validation Map

**Created:** 2026-04-17
**Phase:** 22-voice-server
**Framework:** pytest (Python), Vitest (TypeScript)

---

## Requirements → Test Coverage Map

| Req ID | Behavior | Test File | Test Description | Automated Command |
|--------|----------|-----------|------------------|-------------------|
| VOICE-01 | `/health` returns JSON with `active` field | `voice-server/tests/test_health.py` | FastAPI TestClient: no state file returns inactive; state file returns active with duration | `cd voice-server && python3.12 -m pytest tests/test_health.py -x` |
| VOICE-02 | GeminiLiveLLMService pipeline builds without import errors | `voice-server/tests/test_pipeline_gemini.py` | Mocks GeminiLiveLLMService, verifies pipeline constructs with 1.0.0 import paths | `cd voice-server && python3.12 -m pytest tests/test_pipeline_gemini.py -x` |
| VOICE-03 | FallbackTTSService tries next provider on exception | `voice-server/tests/test_fallback_tts.py` | Mock providers: first fails, second succeeds; all fail triggers macOS say fallback | `cd voice-server && python3.12 -m pytest tests/test_fallback_tts.py -x` |
| VOICE-04 | TranscriptWriter inserts row into messages table with agent_id='voice' | `voice-server/tests/test_transcript_writer.py` | In-memory SQLite: verifies WAL mode, agent_id, unique request_id | `cd voice-server && python3.12 -m pytest tests/test_transcript_writer.py -x` |
| VOICE-05 | `/api/voice-status` returns 200 with active field | `src/app/api/voice-status/__tests__/route.test.ts` | Mocks fetch: server up returns JSON, server down returns error fallback | `npx vitest run src/app/api/voice-status` |
| DASH-04 | VoicePanel renders active/inactive/unavailable states | `src/components/voice/__tests__/VoicePanel.test.tsx` | Mocks hooks: renders status dots, duration, transcript entries, empty state | `npx vitest run src/components/voice` |

---

## Structural Verification

| Check | Command |
|-------|---------|
| `useVoiceStatus()` exported | `grep -q "useVoiceStatus" src/lib/api-client.ts` |
| Voice poll interval defined | `grep -q "voice" src/lib/constants.ts` |
| Voice-status route exists | `test -f src/app/api/voice-status/route.ts` |
| VoicePanel wired into Flow page | `grep -q "VoicePanel" src/app/flow/page.tsx` |
| Recall route accepts agent_id | `grep -q "agent_id" src/app/api/recall/route.ts` |
| Python server uses WebsocketServerTransport | `grep -q "WebsocketServerTransport" voice-server/server.py` |
| Python imports use 1.0.0 paths | `grep -q "pipecat.services.google.gemini_live" voice-server/pipeline_gemini.py` |
| Transcript writer sets WAL mode | `grep -q "journal_mode=WAL" voice-server/transcript_writer.py` |
| FallbackTTS includes Gradium conditional | `grep -q "GRADIUM_API_KEY" voice-server/fallback_tts.py` |
| Cascade STT has Whisper fallback | `grep -q "WhisperSTTServiceMLX" voice-server/pipeline_cascade.py` |

---

## Phase Gate Commands

```bash
# Wave 1 gate (Python backend)
cd voice-server && python3.12 -m pytest tests/ -x -v

# Wave 2 gate (TypeScript frontend)
npx vitest run src/app/api/voice-status src/components/voice

# Full phase gate
cd voice-server && python3.12 -m pytest tests/ -x -v && cd .. && npx vitest run src/app/api/voice-status src/components/voice && npm run build
```

---

## Open Questions

All planning-stage questions are resolved in `22-RESEARCH.md` under `## Open Questions (RESOLVED)`.

- RESOLVED: Fix LLM to Claude via `VOICE_AGENT_MODEL` env var; defer dynamic agent routing
- RESOLVED: Use `transcript_proc.user()` pattern with getattr fallback for frame field names
- RESOLVED: `voice-server/.env.example` documents absolute `SQLITE_DB_PATH`; user populates at setup
- RESOLVED: Manual launch for Phase 22; LaunchAgent integration deferred
