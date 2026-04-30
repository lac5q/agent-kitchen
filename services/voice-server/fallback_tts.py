"""
voice-server/fallback_tts.py

FallbackTTSService — custom TTS provider chain with graceful fallthrough.

Pipecat has no built-in TTS fallback chaining. This is ~60 lines of custom code.
Provider order (per VOICE-03):
  1. CartesiaTTSService  — when CARTESIA_API_KEY is set (primary)
  2. ElevenLabsTTSService — when ELEVENLABS_API_KEY is set (first cloud fallback)
  3. GradiumTTSService   — when GRADIUM_API_KEY is set (second cloud fallback)
  4. KokoroTTSService    — always added (local offline, no API key)
  5. macOS say subprocess — absolute last resort (no audio frames returned)

Security note (T-22-05): subprocess.run called with explicit list, never shell=True.
"""
import asyncio
import logging
import os
import subprocess

from pipecat.services.tts_service import TTSService

logger = logging.getLogger(__name__)


class FallbackTTSService(TTSService):
    """Tries TTS providers in order; falls through on exception."""

    def __init__(self, providers: list, **kwargs):
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
                logger.warning(
                    "TTS provider %d (%s) failed: %s",
                    i,
                    type(provider).__name__,
                    e,
                )
                self._active_idx = i + 1

        # All providers exhausted — macOS say as absolute last resort.
        # Produces no audio frames (system speaker only).
        # T-22-05: explicit list, no shell=True.
        await asyncio.to_thread(subprocess.run, ["say", text], check=False)


def build_fallback_tts() -> FallbackTTSService:
    """
    Construct FallbackTTSService with providers based on available API keys.

    Provider chain (VOICE-03):
      Cartesia -> ElevenLabs -> Gradium (optional) -> Kokoro -> macOS say
    """
    from pipecat.services.cartesia.tts import CartesiaTTSService
    from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
    from pipecat.services.kokoro.tts import KokoroTTSService

    providers = []

    if os.getenv("CARTESIA_API_KEY"):
        providers.append(
            CartesiaTTSService(
                api_key=os.getenv("CARTESIA_API_KEY"),
                settings=CartesiaTTSService.Settings(voice="sonic-3"),
            )
        )

    if os.getenv("ELEVENLABS_API_KEY"):
        providers.append(
            ElevenLabsTTSService(
                api_key=os.getenv("ELEVENLABS_API_KEY"),
            )
        )

    # GradiumTTSService is optional — wrap import in try/except since it may
    # not be installed or available in all pipecat builds (ASSUMED: A7 in research)
    if os.getenv("GRADIUM_API_KEY"):
        try:
            from pipecat.services.gradium.tts import GradiumTTSService
            providers.append(GradiumTTSService(api_key=os.getenv("GRADIUM_API_KEY")))
        except ImportError:
            logger.warning(
                "GRADIUM_API_KEY is set but pipecat.services.gradium.tts could not "
                "be imported — skipping Gradium TTS provider"
            )

    # KokoroTTSService is always available as a local offline fallback
    providers.append(KokoroTTSService())

    return FallbackTTSService(providers=providers)
