"""
Tests for services/tts.py

edge_tts.Communicate is mocked to avoid real network calls.
"""

import pytest
from unittest.mock import MagicMock, patch
from services.tts import _pick_voice, _rate_str, synthesize, VOICE_MAP


# ── _pick_voice ───────────────────────────────────────────────────────────────

def test_pick_voice_known_language():
    assert _pick_voice("en") == VOICE_MAP["en"]


def test_pick_voice_case_insensitive():
    assert _pick_voice("EN") == VOICE_MAP["en"]
    assert _pick_voice("De") == VOICE_MAP["de"]


def test_pick_voice_full_locale_exact_match():
    assert _pick_voice("en-gb") == VOICE_MAP["en-gb"]


def test_pick_voice_unknown_locale_falls_back_to_base():
    # "en-AU" not in map, should fall back to "en"
    assert _pick_voice("en-AU") == VOICE_MAP["en"]


def test_pick_voice_completely_unknown_returns_fallback():
    result = _pick_voice("xx")
    assert result == "en-US-JennyNeural"


def test_pick_voice_strips_whitespace():
    assert _pick_voice("  de  ") == VOICE_MAP["de"]


# ── _rate_str ─────────────────────────────────────────────────────────────────

def test_rate_str_normal_speed():
    assert _rate_str(1.0) == "+0%"


def test_rate_str_faster():
    assert _rate_str(1.5) == "+50%"


def test_rate_str_slower():
    assert _rate_str(0.75) == "-25%"


def test_rate_str_double_speed():
    assert _rate_str(2.0) == "+100%"


# ── synthesize ────────────────────────────────────────────────────────────────

async def test_synthesize_returns_audio_bytes():
    async def fake_stream():
        yield {"type": "audio", "data": b"chunk1"}
        yield {"type": "wordBoundary", "data": None}
        yield {"type": "audio", "data": b"chunk2"}

    mock_comm = MagicMock()
    mock_comm.stream = fake_stream

    with patch("services.tts.edge_tts.Communicate", return_value=mock_comm):
        result = await synthesize("Hello world", "en", 1.0)

    assert result == b"chunk1chunk2"


async def test_synthesize_ignores_non_audio_chunks():
    async def fake_stream():
        yield {"type": "wordBoundary", "data": b"ignored"}
        yield {"type": "audio", "data": b"audio_only"}

    mock_comm = MagicMock()
    mock_comm.stream = fake_stream

    with patch("services.tts.edge_tts.Communicate", return_value=mock_comm):
        result = await synthesize("Hello", "en", 1.0)

    assert result == b"audio_only"


async def test_synthesize_uses_correct_voice_and_rate():
    async def fake_stream():
        return
        yield  # make it an async generator

    mock_comm = MagicMock()
    mock_comm.stream = fake_stream

    with patch("services.tts.edge_tts.Communicate", return_value=mock_comm) as mock_cls:
        await synthesize("Test", "de", 1.5)

    mock_cls.assert_called_once_with("Test", VOICE_MAP["de"], rate="+50%")
