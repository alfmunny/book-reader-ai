"""
Tests for services/gemini.py

All external Gemini API calls are mocked via _generate.
"""

import pytest
from unittest.mock import AsyncMock, patch
from services import gemini


def mock_generate(return_value: str):
    return patch("services.gemini._generate", new_callable=AsyncMock, return_value=return_value)


# ── _lang helper ──────────────────────────────────────────────────────────────

def test_lang_returns_empty_for_english():
    assert gemini._lang("en") == ""


def test_lang_returns_empty_for_none():
    assert gemini._lang("") == ""


def test_lang_returns_instruction_for_non_english():
    result = gemini._lang("de")
    assert "de" in result
    assert "language" in result.lower()


# ── generate_insight ──────────────────────────────────────────────────────────

async def test_generate_insight_calls_generate():
    with mock_generate("A deep insight.") as m:
        result = await gemini.generate_insight("key", "Chapter text", "Faust", "Goethe")
    assert result == "A deep insight."
    m.assert_called_once()


async def test_generate_insight_passes_language():
    with mock_generate("Eine Erkenntnis.") as m:
        await gemini.generate_insight("key", "text", "title", "author", response_language="de")
    call_args = m.call_args[0]
    assert "de" in call_args[1]  # system prompt contains language instruction


# ── answer_question ───────────────────────────────────────────────────────────

async def test_answer_question_returns_answer():
    with mock_generate("The answer is 42."):
        result = await gemini.answer_question("key", "What?", "passage", "Book", "Author")
    assert result == "The answer is 42."


# ── check_pronunciation ───────────────────────────────────────────────────────

async def test_check_pronunciation_returns_feedback():
    with mock_generate("Good effort!"):
        result = await gemini.check_pronunciation("key", "Hello world", "Helo world", "en")
    assert result == "Good effort!"


# ── suggest_youtube_query ─────────────────────────────────────────────────────

async def test_suggest_youtube_query_strips_whitespace():
    with mock_generate("  Faust opera performance  "):
        result = await gemini.suggest_youtube_query("key", "passage", "Faust", "Goethe")
    assert result == "Faust opera performance"


# ── translate_chunk ───────────────────────────────────────────────────────────

async def test_translate_chunk_returns_translation():
    with mock_generate("Bonjour le monde"):
        result = await gemini.translate_chunk("key", "Hello world", "en", "fr")
    assert result == "Bonjour le monde"


# ── translate_text ────────────────────────────────────────────────────────────

async def test_translate_text_empty_returns_empty():
    result = await gemini.translate_text("key", "", "en", "de")
    assert result == []


async def test_translate_text_whitespace_only_returns_empty():
    result = await gemini.translate_text("key", "   \n\n  ", "en", "de")
    assert result == []


async def test_translate_text_single_paragraph():
    with mock_generate("Hallo Welt"):
        result = await gemini.translate_text("key", "Hello world", "en", "de")
    assert result == ["Hallo Welt"]


async def test_translate_text_multiple_paragraphs():
    translated = "Erstes.\n\nZweites.\n\nDrittes."
    with mock_generate(translated):
        result = await gemini.translate_text("key", "First.\n\nSecond.\n\nThird.", "en", "de")
    assert len(result) == 3
    assert result[0] == "Erstes."


async def test_translate_text_chunks_large_input():
    """Large input that exceeds chunk_size should be split into multiple chunks."""
    # Each paragraph is 1000 chars; chunk_size default is 5000 → needs 2 chunks for 6 paras
    para = "x" * 1000
    text = "\n\n".join([para] * 6)
    translated_chunk = "\n\n".join(["y" * 1000] * 3)

    with patch("services.gemini.translate_chunk", new_callable=AsyncMock, return_value=translated_chunk) as m:
        result = await gemini.translate_text("key", text, "en", "de", chunk_size=3500)

    # Should have been called more than once (two chunks of 3+3 paragraphs)
    assert m.call_count >= 2
    assert len(result) == 6
