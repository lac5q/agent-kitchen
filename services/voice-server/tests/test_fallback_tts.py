"""
voice-server/tests/test_fallback_tts.py

Tests for FallbackTTSService — custom TTS provider chain with graceful fallthrough.
"""
import asyncio
import os
import pytest
from unittest.mock import MagicMock, patch, AsyncMock


async def _collect(async_gen):
    """Drain an async generator and return its items as a list."""
    items = []
    async for item in async_gen:
        items.append(item)
    return items


class _SuccessProvider:
    """Mock TTS provider that always succeeds and yields one audio chunk."""
    async def run_tts(self, text: str):
        yield b"audio_chunk"


class _FailProvider:
    """Mock TTS provider that always raises an exception."""
    async def run_tts(self, text: str):
        raise RuntimeError("Provider unavailable")
        yield  # make it an async generator


class _EmptyProvider:
    """Mock TTS provider that yields nothing (empty audio)."""
    async def run_tts(self, text: str):
        return
        yield


def test_fallback_tts_import():
    """FallbackTTSService can be imported."""
    from fallback_tts import FallbackTTSService
    assert FallbackTTSService is not None


def test_fallback_tts_uses_first_provider_when_it_succeeds():
    """When first provider succeeds, its audio is returned."""
    from fallback_tts import FallbackTTSService

    provider_a = _SuccessProvider()
    provider_b = _FailProvider()

    svc = FallbackTTSService(providers=[provider_a, provider_b])

    chunks = asyncio.get_event_loop().run_until_complete(_collect(svc.run_tts("hello")))
    assert chunks == [b"audio_chunk"]


def test_fallback_tts_falls_through_to_second_provider():
    """When first provider fails, second provider is tried."""
    from fallback_tts import FallbackTTSService

    provider_a = _FailProvider()
    provider_b = _SuccessProvider()

    svc = FallbackTTSService(providers=[provider_a, provider_b])

    chunks = asyncio.get_event_loop().run_until_complete(_collect(svc.run_tts("hello")))
    assert chunks == [b"audio_chunk"]


def test_fallback_tts_all_fail_triggers_say():
    """When all providers fail, subprocess.run(['say', text]) is called."""
    from fallback_tts import FallbackTTSService

    svc = FallbackTTSService(providers=[_FailProvider(), _FailProvider()])

    with patch("fallback_tts.subprocess") as mock_subprocess:
        mock_subprocess.run = MagicMock()
        asyncio.get_event_loop().run_until_complete(_collect(svc.run_tts("fallback")))
        mock_subprocess.run.assert_called_once()
        call_args = mock_subprocess.run.call_args[0][0]
        assert call_args[0] == "say"
        assert "fallback" in call_args


def test_fallback_tts_empty_providers_triggers_say():
    """With no providers at all, macOS say is called."""
    from fallback_tts import FallbackTTSService

    svc = FallbackTTSService(providers=[])

    with patch("fallback_tts.subprocess") as mock_subprocess:
        mock_subprocess.run = MagicMock()
        asyncio.get_event_loop().run_until_complete(_collect(svc.run_tts("empty")))
        mock_subprocess.run.assert_called_once()


def test_build_fallback_tts_returns_service(monkeypatch):
    """build_fallback_tts() returns a FallbackTTSService instance."""
    from fallback_tts import FallbackTTSService, build_fallback_tts

    # No API keys set — only Kokoro should be in the chain
    monkeypatch.delenv("CARTESIA_API_KEY", raising=False)
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    monkeypatch.delenv("GRADIUM_API_KEY", raising=False)

    svc = build_fallback_tts()
    assert isinstance(svc, FallbackTTSService)


def test_build_fallback_tts_includes_gradium_when_key_set(monkeypatch):
    """GradiumTTSService is included in the provider chain when GRADIUM_API_KEY is set."""
    monkeypatch.setenv("GRADIUM_API_KEY", "test-key")
    monkeypatch.delenv("CARTESIA_API_KEY", raising=False)
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)

    # Mock GradiumTTSService since it may not be installed
    gradium_mock = MagicMock()
    gradium_tts_instance = MagicMock()
    gradium_mock.GradiumTTSService = MagicMock(return_value=gradium_tts_instance)

    import sys
    sys.modules["pipecat.services.gradium"] = MagicMock()
    sys.modules["pipecat.services.gradium.tts"] = gradium_mock

    from fallback_tts import build_fallback_tts
    svc = build_fallback_tts()

    # Gradium instance should be somewhere in the providers list
    assert gradium_tts_instance in svc._providers


def test_build_fallback_tts_gradium_order(monkeypatch):
    """GradiumTTSService is inserted between ElevenLabs and Kokoro."""
    monkeypatch.setenv("CARTESIA_API_KEY", "c-key")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "e-key")
    monkeypatch.setenv("GRADIUM_API_KEY", "g-key")

    import sys
    from unittest.mock import MagicMock

    cartesia_inst = MagicMock(name="CartesiaInst")
    eleven_inst = MagicMock(name="ElevenInst")
    gradium_inst = MagicMock(name="GradiumInst")
    kokoro_inst = MagicMock(name="KokoroInst")

    sys.modules["pipecat.services.cartesia.tts"].CartesiaTTSService = MagicMock(return_value=cartesia_inst)
    sys.modules["pipecat.services.elevenlabs.tts"].ElevenLabsTTSService = MagicMock(return_value=eleven_inst)
    sys.modules["pipecat.services.gradium"] = MagicMock()
    gradium_mod = MagicMock()
    gradium_mod.GradiumTTSService = MagicMock(return_value=gradium_inst)
    sys.modules["pipecat.services.gradium.tts"] = gradium_mod
    sys.modules["pipecat.services.kokoro.tts"].KokoroTTSService = MagicMock(return_value=kokoro_inst)

    # Reload module to pick up fresh env + sys.modules
    import importlib
    import fallback_tts
    importlib.reload(fallback_tts)

    svc = fallback_tts.build_fallback_tts()
    providers = svc._providers

    # Order must be: Cartesia, ElevenLabs, Gradium, Kokoro
    assert len(providers) == 4
    assert providers[0] is cartesia_inst
    assert providers[1] is eleven_inst
    assert providers[2] is gradium_inst
    assert providers[3] is kokoro_inst
