"""
Tests for services/tts.py — Edge TTS backend with gender support.
"""

import pytest
from unittest.mock import MagicMock, patch

from services.tts import (
    _pick_edge_voice,
    _rate_str,
    chunk_text,
    synthesize,
    EDGE_VOICE_FEMALE,
    EDGE_VOICE_MALE,
    TTS_CHUNK_CHARS,
)


# ── _pick_edge_voice ──────────────────────────────────────────────────────────

def test_pick_edge_voice_female_default():
    assert _pick_edge_voice("en") == EDGE_VOICE_FEMALE["en"]


def test_pick_edge_voice_male():
    assert _pick_edge_voice("en", "male") == EDGE_VOICE_MALE["en"]


def test_pick_edge_voice_case_insensitive():
    assert _pick_edge_voice("EN") == EDGE_VOICE_FEMALE["en"]
    assert _pick_edge_voice("DE", "male") == EDGE_VOICE_MALE["de"]


def test_pick_edge_voice_full_locale_exact_match():
    assert _pick_edge_voice("en-gb") == EDGE_VOICE_FEMALE["en-gb"]
    assert _pick_edge_voice("en-gb", "male") == EDGE_VOICE_MALE["en-gb"]


def test_pick_edge_voice_unknown_locale_falls_back_to_base():
    assert _pick_edge_voice("en-AU") == EDGE_VOICE_FEMALE["en"]
    assert _pick_edge_voice("en-AU", "male") == EDGE_VOICE_MALE["en"]


def test_pick_edge_voice_completely_unknown_returns_fallback():
    assert "Neural" in _pick_edge_voice("xx")
    assert "Neural" in _pick_edge_voice("xx", "male")


def test_pick_edge_voice_strips_whitespace():
    assert _pick_edge_voice("  de  ") == EDGE_VOICE_FEMALE["de"]


def test_female_and_male_voices_differ_for_same_language():
    assert _pick_edge_voice("en", "female") != _pick_edge_voice("en", "male")
    assert _pick_edge_voice("de", "female") != _pick_edge_voice("de", "male")


# ── _rate_str ─────────────────────────────────────────────────────────────────

def test_rate_str_normal_speed():
    assert _rate_str(1.0) == "+0%"


def test_rate_str_faster():
    assert _rate_str(1.5) == "+50%"


def test_rate_str_slower():
    assert _rate_str(0.75) == "-25%"


def test_rate_str_double_speed():
    assert _rate_str(2.0) == "+100%"


# ── Edge synthesize ────────────────────────────────────────────────────────────

async def test_edge_synthesize_returns_mp3_bytes():
    async def fake_stream():
        yield {"type": "audio", "data": b"chunk1"}
        yield {"type": "wordBoundary", "data": None}
        yield {"type": "audio", "data": b"chunk2"}

    mock_comm = MagicMock()
    mock_comm.stream = fake_stream

    with patch("services.tts.edge_tts.Communicate", return_value=mock_comm):
        audio, ct, _ = await synthesize("Hello world", "en", 1.0)

    assert audio == b"chunk1chunk2"
    assert ct == "audio/mpeg"


async def test_edge_synthesize_ignores_non_audio_chunks():
    async def fake_stream():
        yield {"type": "wordBoundary", "data": b"ignored"}
        yield {"type": "audio", "data": b"audio_only"}

    mock_comm = MagicMock()
    mock_comm.stream = fake_stream

    with patch("services.tts.edge_tts.Communicate", return_value=mock_comm):
        audio, _, _ = await synthesize("Hello", "en", 1.0)

    assert audio == b"audio_only"



async def test_edge_synthesize_collects_word_boundaries():
    async def fake_stream():
        yield {"type": "audio", "data": b"audio"}
        yield {"type": "WordBoundary", "offset": 1_000_000, "duration": 500_000, "text": "Hello"}
        yield {"type": "WordBoundary", "offset": 5_000_000, "duration": 400_000, "text": "world"}

    mock_comm = MagicMock()
    mock_comm.stream = fake_stream

    with patch("services.tts.edge_tts.Communicate", return_value=mock_comm):
        _, _, boundaries = await synthesize("Hello world", "en", 1.0)

    assert len(boundaries) == 2
    assert boundaries[0] == {"offset_ms": 100.0, "text": "Hello"}
    assert boundaries[1] == {"offset_ms": 500.0, "text": "world"}



async def test_edge_synthesize_uses_female_voice_by_default():
    async def fake_stream():
        return
        yield

    mock_comm = MagicMock()
    mock_comm.stream = fake_stream

    with patch("services.tts.edge_tts.Communicate", return_value=mock_comm) as mock_cls:
        await synthesize("Test", "de", 1.5)

    mock_cls.assert_called_once_with("Test", EDGE_VOICE_FEMALE["de"], rate="+50%")


async def test_edge_synthesize_uses_male_voice_when_specified():
    async def fake_stream():
        return
        yield

    mock_comm = MagicMock()
    mock_comm.stream = fake_stream

    with patch("services.tts.edge_tts.Communicate", return_value=mock_comm) as mock_cls:
        await synthesize("Test", "en", 1.0, gender="male")

    mock_cls.assert_called_once_with("Test", EDGE_VOICE_MALE["en"], rate="+0%")


# ── chunk_text ─────────────────────────────────────────────────────────────────

def test_chunk_short_text_returns_single_chunk():
    assert chunk_text("Just a short paragraph.") == ["Just a short paragraph."]


def test_chunk_drops_empty_paragraphs():
    chunks = chunk_text("\n\n\n\nFirst.\n\n\n\nSecond.\n\n")
    assert len(chunks) == 1
    assert "First." in chunks[0]
    assert "Second." in chunks[0]


def test_chunk_groups_paragraphs_under_limit():
    text = "A" * 100 + "\n\n" + "B" * 100 + "\n\n" + "C" * 100
    assert len(chunk_text(text, max_chars=400)) == 1


def test_chunk_splits_when_over_limit():
    text = "A" * 200 + "\n\n" + "B" * 200 + "\n\n" + "C" * 200
    assert len(chunk_text(text, max_chars=300)) == 3


def test_chunk_splits_oversized_paragraph_on_lines():
    long_para = "\n".join([f"Line {i} of this poem about ocean waves." for i in range(20)])
    chunks = chunk_text(long_para, max_chars=100)
    assert len(chunks) > 1
    for c in chunks:
        assert len(c) <= 200
    rejoined = " ".join(chunks)
    assert "Line 0" in rejoined
    assert "Line 19" in rejoined


def test_chunk_real_faust_text():
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
    chunks = chunk_text(faust, max_chars=TTS_CHUNK_CHARS)
    assert len(chunks) >= 1
    for c in chunks:
        assert len(c) <= TTS_CHUNK_CHARS + 100


def test_chunk_empty_input():
    assert chunk_text("") == []
    assert chunk_text("\n\n  \n\n") == []


# ── Pure single-language voices (no MultilingualNeural) ──────────────────────

def test_no_multilingual_voices():
    """All voices should be pure single-language, not MultilingualNeural,
    to prevent auto-switching to English pronunciation."""
    for lang, voice in EDGE_VOICE_FEMALE.items():
        assert "Multilingual" not in voice, f"Female {lang}: {voice} is Multilingual"
    for lang, voice in EDGE_VOICE_MALE.items():
        assert "Multilingual" not in voice, f"Male {lang}: {voice} is Multilingual"


def test_german_voices_are_pure():
    assert EDGE_VOICE_FEMALE["de"] == "de-DE-KatjaNeural"
    assert EDGE_VOICE_MALE["de"] == "de-DE-ConradNeural"


def test_french_voices_are_pure():
    assert EDGE_VOICE_FEMALE["fr"] == "fr-FR-DeniseNeural"
    assert EDGE_VOICE_MALE["fr"] == "fr-FR-HenriNeural"


def test_english_voices_are_pure():
    assert EDGE_VOICE_FEMALE["en"] == "en-US-JennyNeural"
    assert EDGE_VOICE_MALE["en"] == "en-US-GuyNeural"
