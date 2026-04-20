"""Extended tests for services/translate.py — _google_translate, translate_text, and provider dispatch."""

import asyncio
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from services.translate import (
    _normalize_google_lang,
    _is_verse,
    _unwrap_paragraph,
    _is_heading,
    _google_translate,
    translate_text,
)


# ── _normalize_google_lang ───────────────────────────────────────────────────

def test_normalize_zh():
    assert _normalize_google_lang("zh") == "zh-CN"


def test_normalize_passthrough():
    assert _normalize_google_lang("de") == "de"


# ── _is_verse ────────────────────────────────────────────────────────────────

def test_is_verse_true_for_short_lines():
    text = "\n".join(["Short line here"] * 5)
    assert _is_verse(text) is True


def test_is_verse_false_for_prose():
    text = (
        "I am by birth a Genevese and my family is one of the most distinguished\n"
        "of that republic. My ancestors had been for many years counsellors and\n"
        "syndics and my father had filled several public situations with honour."
    )
    assert _is_verse(text) is False


def test_is_verse_false_for_fewer_than_3_lines():
    assert _is_verse("Line one\nLine two") is False


# ── _unwrap_paragraph ────────────────────────────────────────────────────────

def test_unwrap_joins_hard_wrapped_prose():
    text = "The quick brown fox jumps over the lazy\ndog near the river bank."
    result = _unwrap_paragraph(text)
    assert result == "The quick brown fox jumps over the lazy dog near the river bank."


def test_unwrap_preserves_verse():
    verse = "Shall I compare thee\nto a summer's day?\nThou art more lovely\nand more temperate.\nRough winds do shake\nthe darling buds of May."
    assert _unwrap_paragraph(verse) == verse


# ── _is_heading ──────────────────────────────────────────────────────────────

def test_is_heading_chapter_i():
    assert _is_heading("CHAPTER I") is True


def test_is_heading_roman_xiv_dot():
    assert _is_heading("XIV.") is True


def test_is_heading_bare_number():
    assert _is_heading("3.") is True


def test_is_heading_prologue():
    assert _is_heading("PROLOGUE") is True


def test_is_heading_false_for_prose():
    assert _is_heading("It was the best of times, it was the worst of times.") is False


# ── _google_translate ────────────────────────────────────────────────────────

async def test_google_translate_empty_text_returns_empty():
    result = await _google_translate("", "en", "de")
    assert result == []


async def test_google_translate_empty_paragraphs_only_returns_empty():
    result = await _google_translate("\n\n\n", "en", "de")
    assert result == []


async def test_google_translate_prose_paragraph():
    with patch("deep_translator.GoogleTranslator") as MockGT:
        instance = MockGT.return_value
        instance.translate.return_value = "Translated prose"

        result = await _google_translate(
            "This is a long enough prose line that will not be treated as verse by the detector.",
            "en", "de",
        )
    assert len(result) == 1
    assert result[0] == "Translated prose"


async def test_google_translate_heading_passed_through():
    """Headings must not be sent to Google Translate."""
    with patch("deep_translator.GoogleTranslator") as MockGT:
        instance = MockGT.return_value
        instance.translate.return_value = "sollte nicht aufgerufen werden"

        result = await _google_translate("CHAPTER I", "en", "de")

    assert result == ["CHAPTER I"]
    instance.translate.assert_not_called()


async def test_google_translate_verse_line_by_line():
    """Verse paragraphs are translated line by line."""
    verse = "Short line one\nShort line two\nShort line three\nShort line four\nShort line five"
    call_count = 0
    translated_lines = ["Zeile eins", "Zeile zwei", "Zeile drei", "Zeile vier", "Zeile fünf"]

    with patch("deep_translator.GoogleTranslator") as MockGT:
        instance = MockGT.return_value
        instance.translate.side_effect = translated_lines

        result = await _google_translate(verse, "en", "de")

    assert len(result) == 1
    assert result[0] == "\n".join(translated_lines)
    assert instance.translate.call_count == 5


async def test_google_translate_multiple_paragraphs():
    """Each paragraph separated by \\n\\n is translated separately."""
    text = "First paragraph text here.\n\nSecond paragraph text here."
    with patch("deep_translator.GoogleTranslator") as MockGT:
        instance = MockGT.return_value
        instance.translate.side_effect = ["Erster Absatz.", "Zweiter Absatz."]

        result = await _google_translate(text, "en", "de")

    assert len(result) == 2
    assert result[0] == "Erster Absatz."
    assert result[1] == "Zweiter Absatz."


# ── translate_text provider dispatch ─────────────────────────────────────────

async def test_translate_text_google_provider():
    with patch("deep_translator.GoogleTranslator") as MockGT:
        instance = MockGT.return_value
        instance.translate.return_value = "Hallo Welt"

        result = await translate_text(
            "Hello world",
            source_language="en",
            target_language="de",
            provider="google",
        )
    assert isinstance(result, list)
    assert result[0] == "Hallo Welt"


async def test_translate_text_gemini_provider_calls_gemini_service():
    mock_paragraphs = ["Bonjour le monde"]
    with patch("services.gemini.translate_text", new_callable=AsyncMock) as mock_gemini:
        mock_gemini.return_value = mock_paragraphs

        result = await translate_text(
            "Hello world",
            source_language="en",
            target_language="fr",
            provider="gemini",
            gemini_key="test-api-key",
        )

    assert result == mock_paragraphs
    mock_gemini.assert_called_once_with("test-api-key", "Hello world", "en", "fr")


async def test_translate_text_gemini_without_key_raises():
    with pytest.raises(ValueError, match="Gemini API key required"):
        await translate_text(
            "Hello world",
            source_language="en",
            target_language="fr",
            provider="gemini",
            gemini_key=None,
        )


async def test_translate_text_defaults_to_google():
    with patch("deep_translator.GoogleTranslator") as MockGT:
        instance = MockGT.return_value
        instance.translate.return_value = "Resultat"

        result = await translate_text(
            "Some text",
            source_language="en",
            target_language="de",
        )
    assert result == ["Resultat"]
