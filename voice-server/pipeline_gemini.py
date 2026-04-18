"""
voice-server/pipeline_gemini.py

Gemini Live speech-to-speech pipeline builder (VOICE-02).

Uses Pipecat 1.0.0 fully-qualified import paths (breaking change from 0.0.x):
  NEW: pipecat.services.google.gemini_live
  NEW: pipecat.processors.aggregators.llm_context
  OLD (broken): pipecat.services.gemini_multimodal_live.gemini
  OLD (broken): pipecat.processors.aggregators.openai_llm_context

Pipeline order (Pattern 2 from 22-RESEARCH.md):
  transport.input()
  -> agg.user()
  -> transcript_proc.user()    # capture user turns after aggregation
  -> llm                       # GeminiLiveLLMService (speech-to-speech)
  -> transcript_proc.assistant() # capture assistant turns
  -> transport.output()
  -> agg.assistant()

Note: Same TranscriptProcessor instance but .user() and .assistant() return
DISTINCT objects — never place the same instance twice (Pitfall 4).
"""
import os

from pipecat.services.google.gemini_live import GeminiLiveLLMService, GeminiVADParams
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.pipeline.pipeline import Pipeline

from transcript_proc_helper import build_transcript_proc


def build_gemini_pipeline(transport, session_id: str) -> Pipeline:
    """
    Build a Gemini Live speech-to-speech pipeline.

    Args:
        transport:  WebsocketServerTransport instance (provides input/output)
        session_id: UUID string for the current voice session

    Returns:
        Pipeline ready to be wrapped in PipelineTask
    """
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
        transcript_proc.user(),       # DISTINCT object from proc factory
        llm,
        transcript_proc.assistant(),  # DISTINCT object from proc factory
        transport.output(),
        agg.assistant(),
    ])
