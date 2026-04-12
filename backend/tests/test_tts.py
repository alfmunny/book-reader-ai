"""
Tests for services/tts.py — both the Edge backend and the Gemini backend.

External SDKs (edge_tts.Communicate, google.genai.Client) are mocked.
"""

import pytest
from unittest.mock import MagicMock, patch
import struct

from services.tts import (
    _pick_edge_voice,
    _pick_gemini_voice,
    _rate_str,
    _pcm_to_wav,
    _chunk_text_for_tts,
    _trim_trailing_silence,
    synthesize,
    EDGE_VOICE_MAP,
    GEMINI_VOICE_MAP,
    GEMINI_DEFAULT_VOICE,
    GEMINI_TTS_CHUNK_CHARS,
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


# ── _chunk_text_for_tts ───────────────────────────────────────────────────────

def test_chunk_short_text_returns_single_chunk():
    text = "Just a short paragraph."
    chunks = _chunk_text_for_tts(text)
    assert chunks == ["Just a short paragraph."]


def test_chunk_drops_empty_paragraphs():
    text = "\n\n\n\nFirst.\n\n\n\nSecond.\n\n"
    chunks = _chunk_text_for_tts(text)
    # All paragraphs fit in one chunk
    assert len(chunks) == 1
    assert "First." in chunks[0]
    assert "Second." in chunks[0]


def test_chunk_groups_paragraphs_under_limit():
    text = "A" * 100 + "\n\n" + "B" * 100 + "\n\n" + "C" * 100
    chunks = _chunk_text_for_tts(text, max_chars=400)
    # All three paragraphs fit (100+2+100+2+100 = 304 chars)
    assert len(chunks) == 1


def test_chunk_splits_when_over_limit():
    text = "A" * 200 + "\n\n" + "B" * 200 + "\n\n" + "C" * 200
    chunks = _chunk_text_for_tts(text, max_chars=300)
    # Each paragraph is 200 chars, two would be 400+ → split into 3 chunks
    assert len(chunks) == 3


def test_chunk_splits_oversized_paragraph_on_lines():
    # One long paragraph, much bigger than max_chars
    long_para = "\n".join([f"Line {i} of this poem about ocean waves." for i in range(20)])
    chunks = _chunk_text_for_tts(long_para, max_chars=100)
    assert len(chunks) > 1
    # Each chunk should be under or near the limit
    for c in chunks:
        # Allow ~one line over since we add lines greedily
        assert len(c) <= 200, f"Chunk too big: {len(c)}"
    # And the original content should be reconstructable
    rejoined = " ".join(chunks)
    assert "Line 0" in rejoined
    assert "Line 19" in rejoined


def test_chunk_real_faust_text():
    """Faust Zueignung is ~1400 chars — should chunk into a handful of pieces."""
    faust = """Zueignung


Ihr naht euch wieder, schwankende Gestalten,
Die früh sich einst dem trüben Blick gezeigt.
Versuch ich wohl, euch diesmal festzuhalten?

Ihr drängt euch zu! nun gut, so mögt ihr walten,
Wie ihr aus Dunst und Nebel um mich steigt;
Mein Busen fühlt sich jugendlich erschüttert.

Vom Zauberhauch, der euren Zug umwittert.
Ihr bringt mit euch die Bilder froher Tage,
Und manche liebe Schatten steigen auf;
"""
    chunks = _chunk_text_for_tts(faust, max_chars=GEMINI_TTS_CHUNK_CHARS)
    assert len(chunks) >= 1
    # Every chunk respects the size cap (with line-split slack)
    for c in chunks:
        assert len(c) <= GEMINI_TTS_CHUNK_CHARS + 100


def test_chunk_empty_input():
    assert _chunk_text_for_tts("") == []
    assert _chunk_text_for_tts("\n\n  \n\n") == []


# ── _trim_trailing_silence ────────────────────────────────────────────────────

def _make_silence(samples: int) -> bytes:
    return struct.pack(f"<{samples}h", *([0] * samples))


def _make_loud(samples: int, amplitude: int = 5000) -> bytes:
    """A simple loud waveform — alternating samples."""
    return struct.pack(f"<{samples}h", *([amplitude, -amplitude] * (samples // 2)))


def test_trim_silence_keeps_pure_speech_intact():
    speech = _make_loud(24000)  # 1 second of loud audio
    trimmed = _trim_trailing_silence(speech, sample_rate=24000)
    # Should keep all of it (allowing for the small tail cushion)
    assert len(trimmed) >= len(speech) * 0.9


def test_trim_silence_removes_long_trailing_silence():
    # 1 second of speech followed by 5 seconds of silence
    speech = _make_loud(24000)
    silence = _make_silence(5 * 24000)
    pcm = speech + silence
    trimmed = _trim_trailing_silence(pcm, sample_rate=24000, tail_ms=250)

    # Trimmed result should be approximately 1.25s (speech + tail), not 6s
    n_samples = len(trimmed) // 2
    assert n_samples < 24000 * 2, f"Expected < 2s of audio, got {n_samples / 24000:.2f}s"
    assert n_samples > 24000 * 0.9, f"Expected > 0.9s of audio, got {n_samples / 24000:.2f}s"


def test_trim_silence_preserves_internal_silence():
    """A natural pause in the middle of speech should NOT be cut."""
    speech1 = _make_loud(24000)             # 1 sec speech
    pause = _make_silence(int(24000 * 0.5)) # 0.5 sec pause
    speech2 = _make_loud(24000)             # 1 sec speech
    trailing = _make_silence(5 * 24000)     # 5 sec trailing silence
    pcm = speech1 + pause + speech2 + trailing

    trimmed = _trim_trailing_silence(pcm, sample_rate=24000, tail_ms=250)
    n_samples = len(trimmed) // 2
    # Should keep ~2.75s (1 + 0.5 + 1 + 0.25 tail), not the 7.5s total
    assert n_samples > 24000 * 2.4, f"Lost the second speech segment: {n_samples / 24000:.2f}s"
    assert n_samples < 24000 * 3.5, f"Did not trim trailing: {n_samples / 24000:.2f}s"


def test_trim_silence_all_silence_returns_unchanged():
    silence = _make_silence(24000)
    trimmed = _trim_trailing_silence(silence)
    # Falls back to returning input unchanged when nothing is loud
    assert trimmed == silence


def test_trim_silence_empty_input():
    assert _trim_trailing_silence(b"") == b""


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


async def test_gemini_synthesize_calls_generate_content_once_per_request():
    """The synthesize() function is single-chunk — chunking is now the
    caller's responsibility (frontend uses /api/ai/tts/chunks for that).
    A long input should still result in exactly ONE API call here."""
    long_text = "\n\n".join([f"Paragraph number {i}. " + ("x" * 200) for i in range(5)])

    call_count = {"n": 0}
    pcm_per_call = b"\x00\x10" * 100

    fake_genai = MagicMock()
    fake_types = MagicMock()

    async def counting_generate_content(model, contents, config):  # noqa: ARG001
        call_count["n"] += 1
        return _FakeResponse(pcm_per_call)

    fake_genai.Client.return_value.aio.models.generate_content = counting_generate_content

    with patch.dict("sys.modules", {
        "google": MagicMock(genai=fake_genai),
        "google.genai": fake_genai,
        "google.genai.types": fake_types,
    }):
        audio, ct = await synthesize(
            long_text, "en", 1.0, provider="google", gemini_key="dummy-key"
        )

    assert call_count["n"] == 1, f"Expected exactly 1 API call, got {call_count['n']}"
    assert ct == "audio/wav"
    assert audio[:4] == b"RIFF"


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
