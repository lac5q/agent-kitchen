"""
voice-server/transcript_proc_helper.py

TranscriptProcessor factory wired to TranscriptWriter.

Usage in a pipeline:
    proc = build_transcript_proc(session_id)
    Pipeline([
        ...,
        proc.user(),        # capture user turns (DISTINCT object)
        llm,
        proc.assistant(),   # capture assistant turns (DISTINCT object)
        ...
    ])

Per Pattern 4 in 22-RESEARCH.md:
- proc.user() and proc.assistant() are factory methods returning DISTINCT objects
- Placing the same instance twice in the pipeline is a wiring error (Pitfall 4)
- frame.content is preferred; frame.text is checked as a fallback (field name assumed
  per research A5 — verify in actual Pipecat 1.0.0 install)
"""
import os

from pipecat.processors.transcript_processor import TranscriptProcessor
from transcript_writer import TranscriptWriter


def build_transcript_proc(session_id: str) -> TranscriptProcessor:
    """
    Create a TranscriptProcessor with an on_transcript_update handler that
    persists each utterance to SQLite via TranscriptWriter.

    Args:
        session_id: UUID string for the current voice session

    Returns:
        TranscriptProcessor — call .user() and .assistant() separately in
        the pipeline list.
    """
    proc = TranscriptProcessor()
    writer = TranscriptWriter(
        db_path=os.getenv("SQLITE_DB_PATH", "data/conversations.db"),
        session_id=session_id,
    )

    @proc.event_handler("on_transcript_update")
    async def on_update(processor, frame, direction):
        # frame.role is "user" or "assistant"
        # frame.content (primary) or frame.text (fallback) — verify in 1.0.0
        text = getattr(frame, "content", None) or getattr(frame, "text", "")
        if text.strip():
            writer.write(role=frame.role, content=text)

    return proc
