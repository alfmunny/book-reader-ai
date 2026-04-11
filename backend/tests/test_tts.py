"""
Tests for services/tts.py — both the Edge backend and the Gemini backend.

External SDKs (edge_tts.Communicate, google.genai.Client) are mocked.
"""

import pytest
from unittest.mock import MagicMock, patch
from services.tts import (
    _pick_edge_voice,
    _pick_gemini_voice,
    _rate_str,
    _pcm_to_wav,
    synthesize,
    EDGE_VOICE_MAP,
    GEMINI_VOICE_MAP,
    GEMINI_DEFAULT_VOICE,
)


# ── _pick_edge_voice ──────────────────────────────────────────────────────────

def test_pick_edge_voice_known_language():
    assert _pick_edge_voice("en") == EDGE_VOICE_MAP["en"]


def test_pick_edge_voice_case_insensitive():
    assert _pick_edge_voice("EN") == EDGE_VOICE_MAP["en"]
    assert _pick_edge_voice("De") == EDGE_VOICE_MAP["de"]


def test_pick_edge_voice_full_locale_exact_match():
    assert _pick_edge_voice("en-gb") == EDGE_VOICE_MAP["en-gb"]


def test_pick_edge_voice_unknown_locale_falls_back_to_base():
    # "en-AU" not in map, should fall back to "en"
    assert _pick_edge_voice("en-AU") == EDGE_VOICE_MAP["en"]


def test_pick_edge_voice_completely_unknown_returns_fallback():
    assert _pick_edge_voice("xx") == "en-US-JennyNeural"


def test_pick_edge_voice_strips_whitespace():
    assert _pick_edge_voice("  de  ") == EDGE_VOICE_MAP["de"]


# ── _pick_gemini_voice ────────────────────────────────────────────────────────

def test_pick_gemini_voice_known_language():
    assert _pick_gemini_voice("de") == GEMINI_VOICE_MAP["de"]
    assert _pick_gemini_voice("en") == GEMINI_VOICE_MAP["en"]


def test_pick_gemini_voice_unknown_falls_back_to_default():
    assert _pick_gemini_voice("xx") == GEMINI_DEFAULT_VOICE


def test_pick_gemini_voice_strips_locale_suffix():
    # "en-US" → base "en"
    assert _pick_gemini_voice("en-US") == GEMINI_VOICE_MAP["en"]


# ── _rate_str ─────────────────────────────────────────────────────────────────

def test_rate_str_normal_speed():
    assert _rate_str(1.0) == "+0%"


def test_rate_str_faster():
    assert _rate_str(1.5) == "+50%"


def test_rate_str_slower():
    assert _rate_str(0.75) == "-25%"


def test_rate_str_double_speed():
    assert _rate_str(2.0) == "+100%"


# ── _pcm_to_wav ───────────────────────────────────────────────────────────────

def test_pcm_to_wav_starts_with_riff_header():
    pcm = b"\x00\x01\x02\x03"
    wav = _pcm_to_wav(pcm)
    assert wav[:4] == b"RIFF"
    assert wav[8:12] == b"WAVE"


def test_pcm_to_wav_includes_pcm_data_at_end():
    pcm = b"\xff\xfe\xfd\xfc"
    wav = _pcm_to_wav(pcm)
    assert wav.endswith(pcm)


def test_pcm_to_wav_total_size_includes_header():
    # WAV header is 44 bytes for standard PCM
    pcm = b"\x00" * 100
    wav = _pcm_to_wav(pcm)
    assert len(wav) == 44 + 100


# ── Edge backend ──────────────────────────────────────────────────────────────

async def test_edge_synthesize_returns_audio_bytes_and_mp3_content_type():
    async def fake_stream():
        yield {"type": "audio", "data": b"chunk1"}
        yield {"type": "wordBoundary", "data": None}
        yield {"type": "audio", "data": b"chunk2"}

    mock_comm = MagicMock()
    mock_comm.stream = fake_stream

    with patch("services.tts.edge_tts.Communicate", return_value=mock_comm):
        audio, ct = await synthesize("Hello world", "en", 1.0, provider="edge")

    assert audio == b"chunk1chunk2"
    assert ct == "audio/mpeg"


async def test_edge_synthesize_ignores_non_audio_chunks():
    async def fake_stream():
        yield {"type": "wordBoundary", "data": b"ignored"}
        yield {"type": "audio", "data": b"audio_only"}

    mock_comm = MagicMock()
    mock_comm.stream = fake_stream

    with patch("services.tts.edge_tts.Communicate", return_value=mock_comm):
        audio, _ = await synthesize("Hello", "en", 1.0, provider="edge")

    assert audio == b"audio_only"


async def test_edge_synthesize_uses_correct_voice_and_rate():
    async def fake_stream():
        return
        yield  # make it an async generator

    mock_comm = MagicMock()
    mock_comm.stream = fake_stream

    with patch("services.tts.edge_tts.Communicate", return_value=mock_comm) as mock_cls:
        await synthesize("Test", "de", 1.5, provider="edge")

    mock_cls.assert_called_once_with("Test", EDGE_VOICE_MAP["de"], rate="+50%")


# ── Gemini backend ────────────────────────────────────────────────────────────

class _FakeInlineData:
    def __init__(self, data: bytes):
        self.data = data


class _FakePart:
    def __init__(self, data: bytes):
        self.inline_data = _FakeInlineData(data)


class _FakeContent:
    def __init__(self, data: bytes):
        self.parts = [_FakePart(data)]


class _FakeCandidate:
    def __init__(self, data: bytes):
        self.content = _FakeContent(data)


class _FakeResponse:
    def __init__(self, data: bytes):
        self.candidates = [_FakeCandidate(data)]


def _fake_genai(pcm_payload: bytes):
    """Build a `google.genai` mock that returns the given PCM bytes."""
    fake_genai = MagicMock()
    fake_types = MagicMock()

    async def fake_generate_content(model, contents, config):  # noqa: ARG001
        return _FakeResponse(pcm_payload)

    fake_genai.Client.return_value.aio.models.generate_content = fake_generate_content
    return fake_genai, fake_types


async def test_gemini_synthesize_returns_wav_bytes_and_wav_content_type():
    pcm = b"\x00\x01" * 50
    fake_genai, fake_types = _fake_genai(pcm)

    with patch.dict("sys.modules", {"google": MagicMock(genai=fake_genai), "google.genai": fake_genai, "google.genai.types": fake_types}):
        audio, ct = await synthesize(
            "Hello", "en", 1.0, provider="google", gemini_key="dummy-key"
        )

    assert ct == "audio/wav"
    # Should be a WAV file: RIFF header + PCM data
    assert audio[:4] == b"RIFF"
    assert audio[8:12] == b"WAVE"
    assert audio.endswith(pcm)


async def test_gemini_synthesize_requires_api_key():
    with pytest.raises(ValueError, match="Gemini API key required"):
        await synthesize("Hello", "en", 1.0, provider="google", gemini_key=None)


async def test_gemini_synthesize_requires_api_key_empty_string():
    with pytest.raises(ValueError, match="Gemini API key required"):
        await synthesize("Hello", "en", 1.0, provider="google", gemini_key="")


# ── Default provider ──────────────────────────────────────────────────────────

async def test_synthesize_defaults_to_edge_provider():
    """Calling synthesize() without specifying provider should use edge."""
    async def fake_stream():
        yield {"type": "audio", "data": b"x"}

    mock_comm = MagicMock()
    mock_comm.stream = fake_stream

    with patch("services.tts.edge_tts.Communicate", return_value=mock_comm):
        _, ct = await synthesize("Hello", "en", 1.0)

    assert ct == "audio/mpeg"  # Edge → MP3
