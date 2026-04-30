"""
voice-server/tests/conftest.py

Shared fixtures for all voice-server tests.

IMPORTANT: This file mocks the entire pipecat module hierarchy BEFORE any
test file imports modules under test. Pipecat is not installed in the test
environment (it requires a full virtual env with binary deps). All pipecat
imports are replaced with MagicMock stubs so our code can be tested in isolation.
"""
import sys
import sqlite3
import tempfile
import os
import pytest
from unittest.mock import MagicMock


# ---------------------------------------------------------------------------
# Pipecat module mocks — MUST be registered before any test module is imported
# ---------------------------------------------------------------------------

def _make_tts_base():
    """Return a real Python base class that FallbackTTSService can subclass."""
    class TTSService:
        def __init__(self, **kwargs):
            pass
        async def run_tts(self, text: str):
            # Default: yields nothing (subclasses override)
            return
            yield  # make it an async generator
    return TTSService


# Build a fake pipecat.services.tts_service module with a real TTSService class
tts_service_mod = MagicMock()
tts_service_mod.TTSService = _make_tts_base()

# Build fake Pipeline that just stores its elements
class _FakePipeline:
    def __init__(self, elements):
        self.elements = elements

pipeline_mod = MagicMock()
pipeline_mod.Pipeline = _FakePipeline

# Build fake PipelineTask / PipelineRunner / PipelineParams
task_mod = MagicMock()
runner_mod = MagicMock()

# Build fake TranscriptProcessor with user()/assistant() factory
class _FakeTranscriptProc:
    def __init__(self):
        self._handlers = {}

    def event_handler(self, name):
        def decorator(fn):
            self._handlers[name] = fn
            return fn
        return decorator

    def user(self):
        return MagicMock(name="transcript_proc.user()")

    def assistant(self):
        return MagicMock(name="transcript_proc.assistant()")

transcript_proc_mod = MagicMock()
transcript_proc_mod.TranscriptProcessor = _FakeTranscriptProc

# GeminiLiveLLMService mock with Settings inner class and create_context_aggregator
class _FakeGeminiLLM(MagicMock):
    class Settings:
        def __init__(self, **kwargs):
            pass
    def create_context_aggregator(self, context):
        agg = MagicMock()
        agg.user.return_value = MagicMock(name="agg.user()")
        agg.assistant.return_value = MagicMock(name="agg.assistant()")
        return agg

class _FakeGeminiVADParams:
    def __init__(self, **kwargs):
        pass

gemini_live_mod = MagicMock()
gemini_live_mod.GeminiLiveLLMService = _FakeGeminiLLM
gemini_live_mod.GeminiVADParams = _FakeGeminiVADParams

# LLMContext mock
llm_context_mod = MagicMock()
llm_context_mod.LLMContext = MagicMock

# OpenAILLMService mock with create_context_aggregator
class _FakeOpenAILLM(MagicMock):
    def create_context_aggregator(self, context):
        agg = MagicMock()
        agg.user.return_value = MagicMock(name="agg.user()")
        agg.assistant.return_value = MagicMock(name="agg.assistant()")
        return agg

openai_llm_mod = MagicMock()
openai_llm_mod.OpenAILLMService = _FakeOpenAILLM

# Transport mock with input()/output() methods
class _FakeTransport(MagicMock):
    def input(self):
        return MagicMock(name="transport.input()")
    def output(self):
        return MagicMock(name="transport.output()")

websocket_server_mod = MagicMock()
websocket_server_mod.WebsocketServerTransport = _FakeTransport
websocket_server_mod.WebsocketServerParams = MagicMock

# Register all fake modules into sys.modules
_PIPECAT_MOCKS = {
    "pipecat": MagicMock(),
    "pipecat.services": MagicMock(),
    "pipecat.services.tts_service": tts_service_mod,
    "pipecat.services.google": MagicMock(),
    "pipecat.services.google.gemini_live": gemini_live_mod,
    "pipecat.services.groq": MagicMock(),
    "pipecat.services.groq.stt": MagicMock(),
    "pipecat.services.cartesia": MagicMock(),
    "pipecat.services.cartesia.tts": MagicMock(),
    "pipecat.services.elevenlabs": MagicMock(),
    "pipecat.services.elevenlabs.tts": MagicMock(),
    "pipecat.services.kokoro": MagicMock(),
    "pipecat.services.kokoro.tts": MagicMock(),
    "pipecat.services.openai": MagicMock(),
    "pipecat.services.openai.llm": openai_llm_mod,
    "pipecat.services.whisper": MagicMock(),
    "pipecat.services.whisper.stt": MagicMock(),
    "pipecat.processors": MagicMock(),
    "pipecat.processors.aggregators": MagicMock(),
    "pipecat.processors.aggregators.llm_context": llm_context_mod,
    "pipecat.processors.transcript_processor": transcript_proc_mod,
    "pipecat.pipeline": MagicMock(),
    "pipecat.pipeline.pipeline": pipeline_mod,
    "pipecat.pipeline.task": task_mod,
    "pipecat.pipeline.runner": runner_mod,
    "pipecat.audio": MagicMock(),
    "pipecat.audio.vad": MagicMock(),
    "pipecat.audio.vad.silero": MagicMock(),
    "pipecat.transports": MagicMock(),
    "pipecat.transports.network": MagicMock(),
    "pipecat.transports.network.websocket_server": websocket_server_mod,
}

for mod_name, mock in _PIPECAT_MOCKS.items():
    sys.modules.setdefault(mod_name, mock)

# ---------------------------------------------------------------------------
# sys.path: ensure voice-server/ root is importable as a plain package
# ---------------------------------------------------------------------------
import pathlib
_VOICE_SERVER_DIR = str(pathlib.Path(__file__).parent.parent)
if _VOICE_SERVER_DIR not in sys.path:
    sys.path.insert(0, _VOICE_SERVER_DIR)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def in_memory_db():
    """
    In-memory SQLite DB pre-populated with the messages table schema
    (mirroring the DDL from src/lib/db-schema.ts).

    Returns the db_path string ':memory:' cannot be shared across connections,
    so we use a temp file instead — allows TranscriptWriter to open its own
    connection to the same file.
    """
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id          INTEGER PRIMARY KEY,
            session_id  TEXT    NOT NULL,
            project     TEXT    NOT NULL,
            agent_id    TEXT    NOT NULL,
            role        TEXT    NOT NULL,
            content     TEXT    NOT NULL,
            timestamp   TEXT    NOT NULL,
            cwd         TEXT,
            git_branch  TEXT,
            request_id  TEXT,
            UNIQUE(session_id, request_id)
        )
    """)
    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
          USING fts5(
            content,
            project UNINDEXED,
            timestamp UNINDEXED,
            agent_id UNINDEXED,
            content=messages,
            content_rowid=id,
            tokenize='unicode61'
          )
    """)
    conn.execute("""
        CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
          INSERT INTO messages_fts(rowid, content, project, timestamp, agent_id)
          VALUES (new.id, new.content, new.project, new.timestamp, new.agent_id);
        END
    """)
    conn.commit()
    conn.close()

    yield db_path

    os.unlink(db_path)
