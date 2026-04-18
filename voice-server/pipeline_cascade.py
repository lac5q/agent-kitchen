"""
voice-server/pipeline_cascade.py

Cascade STT -> LLM -> TTS pipeline builder (VOICE-03).

STT selection (conditional):
  - GroqSTTService     when GROQ_API_KEY is set (primary, fastest)
  - WhisperSTTServiceMLX when GROQ_API_KEY is absent (local Apple Silicon fallback)
    [ASSUMED import path: pipecat.services.whisper.stt — verify at install]

TTS: FallbackTTSService chain (Cartesia -> ElevenLabs -> Gradium -> Kokoro -> say)

Pipeline order (Pattern 3 from 22-RESEARCH.md):
  transport.input()
  -> SileroVADAnalyzer()
  -> stt
  -> agg.user()
  -> transcript_proc.user()
  -> llm
  -> tts
  -> transcript_proc.assistant()
  -> transport.output()
  -> agg.assistant()
"""
import os
import logging

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.pipeline.pipeline import Pipeline

from fallback_tts import build_fallback_tts
from transcript_proc_helper import build_transcript_proc

logger = logging.getLogger(__name__)


def build_stt():
    """
    Return the appropriate STT service based on available API keys.

    Primary:  GroqSTTService (GROQ_API_KEY must be set)
    Fallback: WhisperSTTServiceMLX (local, Apple Silicon, no API key)
    """
    if os.getenv("GROQ_API_KEY"):
        from pipecat.services.groq.stt import GroqSTTService
        return GroqSTTService(
            api_key=os.getenv("GROQ_API_KEY"),
            settings=GroqSTTService.Settings(
                model="whisper-large-v3-turbo",
                language=None,  # auto-detect
            ),
        )
    else:
        logger.info("GROQ_API_KEY not set — falling back to WhisperSTTServiceMLX (local)")
        try:
            from pipecat.services.whisper.stt import WhisperSTTServiceMLX
            return WhisperSTTServiceMLX()
        except ImportError:
            logger.warning(
                "WhisperSTTServiceMLX import failed — "
                "pipecat.services.whisper.stt may not be installed"
            )
            raise


def build_cascade_pipeline(transport, session_id: str) -> Pipeline:
    """
    Build a cascade STT -> LLM -> TTS pipeline.

    Args:
        transport:  WebsocketServerTransport instance (provides input/output)
        session_id: UUID string for the current voice session

    Returns:
        Pipeline ready to be wrapped in PipelineTask
    """
    stt = build_stt()
    tts = build_fallback_tts()
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
        transcript_proc.user(),       # DISTINCT object from proc factory
        llm,
        tts,
        transcript_proc.assistant(),  # DISTINCT object from proc factory
        transport.output(),
        agg.assistant(),
    ])
