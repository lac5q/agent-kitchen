"""
voice-server/tests/test_pipeline_gemini.py

Tests for pipeline_gemini.py — verifies the Gemini Live pipeline builds
correctly using mocked services (no real API key required).
"""
import sys
import pytest
from unittest.mock import MagicMock, patch


def test_pipeline_gemini_import():
    """pipeline_gemini module can be imported without errors."""
    import pipeline_gemini
    assert hasattr(pipeline_gemini, "build_gemini_pipeline")


def test_build_gemini_pipeline_returns_pipeline(monkeypatch):
    """build_gemini_pipeline() returns a Pipeline object."""
    import sys
    # The Pipeline class in conftest is _FakePipeline
    from pipecat.pipeline.pipeline import Pipeline

    import pipeline_gemini
    import importlib
    importlib.reload(pipeline_gemini)

    # Create a mock transport with input()/output() methods
    transport = MagicMock()
    transport.input.return_value = MagicMock(name="transport.input()")
    transport.output.return_value = MagicMock(name="transport.output()")

    pipeline = pipeline_gemini.build_gemini_pipeline(transport, "test-session-id")

    assert isinstance(pipeline, Pipeline)


def test_build_gemini_pipeline_has_correct_elements(monkeypatch):
    """Pipeline contains the expected number of elements in correct order."""
    import pipeline_gemini
    import importlib
    importlib.reload(pipeline_gemini)

    transport = MagicMock()
    transport.input.return_value = MagicMock(name="transport.input()")
    transport.output.return_value = MagicMock(name="transport.output()")

    pipeline = pipeline_gemini.build_gemini_pipeline(transport, "session-abc")

    # Pipeline order:
    # transport.input(), agg.user(), transcript_proc.user(),
    # llm,
    # transcript_proc.assistant(), transport.output(), agg.assistant()
    # = 7 elements
    assert len(pipeline.elements) == 7


def test_build_gemini_pipeline_uses_1_0_0_imports():
    """Verify 1.0.0 import paths resolve (module is already loaded in sys.modules)."""
    # These imports must not raise — they're mocked in conftest.py
    from pipecat.services.google.gemini_live import GeminiLiveLLMService, GeminiVADParams
    from pipecat.processors.aggregators.llm_context import LLMContext
    from pipecat.pipeline.pipeline import Pipeline

    assert GeminiLiveLLMService is not None
    assert GeminiVADParams is not None
    assert LLMContext is not None
    assert Pipeline is not None


def test_build_gemini_pipeline_calls_transport_input_output():
    """Pipeline uses transport.input() and transport.output()."""
    import pipeline_gemini
    import importlib
    importlib.reload(pipeline_gemini)

    transport = MagicMock()
    in_mock = MagicMock(name="input_elem")
    out_mock = MagicMock(name="output_elem")
    transport.input.return_value = in_mock
    transport.output.return_value = out_mock

    pipeline = pipeline_gemini.build_gemini_pipeline(transport, "session-xyz")

    transport.input.assert_called_once()
    transport.output.assert_called_once()
    assert in_mock in pipeline.elements
    assert out_mock in pipeline.elements
