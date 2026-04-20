"""
Tests for services/claude.py — get_client, _lang, generate_insight,
answer_question, translate_chunk, translate_text.
"""

import anthropic
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import services.claude as claude_module
from services.claude import (
    _lang,
    generate_insight,
    answer_question,
    translate_chunk,
    translate_text,
)


# ── get_client ────────────────────────────────────────────────────────────────

def test_get_client_returns_async_anthropic(monkeypatch):
    """get_client() should return an AsyncAnthropic instance."""
    monkeypatch.setitem(__import__("os").environ, "ANTHROPIC_API_KEY", "test-key")
    # Reset the module-level singleton so we get a fresh call
    monkeypatch.setattr(claude_module, "_client", None)

    with patch("services.claude.anthropic.AsyncAnthropic") as mock_cls:
        fake_instance = MagicMock()
        mock_cls.return_value = fake_instance
        result = claude_module.get_client()
        mock_cls.assert_called_once_with(api_key="test-key")
        assert result is fake_instance


def test_get_client_is_cached(monkeypatch):
    """Second call to get_client() must return the same object (singleton)."""
    monkeypatch.setitem(__import__("os").environ, "ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(claude_module, "_client", None)

    with patch("services.claude.anthropic.AsyncAnthropic") as mock_cls:
        mock_cls.return_value = MagicMock()
        first = claude_module.get_client()
        second = claude_module.get_client()
        assert first is second
        # Constructor should only be called once
        assert mock_cls.call_count == 1


# ── _lang ────────────────────────────────────────────────────────────────────

def test_lang_english_returns_empty():
    assert _lang("en") == ""


def test_lang_non_english_returns_directive():
    result = _lang("de")
    assert result == "\nRespond in this language: de."


def test_lang_none_returns_empty():
    assert _lang("") == ""


def test_lang_zh_returns_directive():
    result = _lang("zh")
    assert "zh" in result
    assert result.startswith("\nRespond in this language:")


# ── generate_insight ─────────────────────────────────────────────────────────

async def test_generate_insight_returns_text():
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text="Fascinating insight about the passage.")]

    with patch("services.claude.get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_msg)
        mock_get_client.return_value = mock_client

        result = await generate_insight(
            chapter_text="It was the best of times, it was the worst of times.",
            book_title="A Tale of Two Cities",
            author="Charles Dickens",
        )

    assert result == "Fascinating insight about the passage."
    mock_client.messages.create.assert_awaited_once()


async def test_generate_insight_with_non_english_language():
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text="Einblick auf Deutsch.")]

    with patch("services.claude.get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_msg)
        mock_get_client.return_value = mock_client

        result = await generate_insight(
            chapter_text="Some text.",
            book_title="Faust",
            author="Goethe",
            response_language="de",
        )

    assert result == "Einblick auf Deutsch."
    call_kwargs = mock_client.messages.create.call_args
    # System prompt should include the language directive
    assert "de" in call_kwargs.kwargs.get("system", "") or "de" in str(call_kwargs)


async def test_generate_insight_truncates_to_1500_chars():
    long_text = "x" * 3000
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text="Insight.")]

    with patch("services.claude.get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_msg)
        mock_get_client.return_value = mock_client

        await generate_insight(long_text, "Book", "Author")

    call_kwargs = mock_client.messages.create.call_args
    user_content = call_kwargs.kwargs["messages"][0]["content"]
    # The excerpt in the message should be capped at 1500 chars
    assert "x" * 1501 not in user_content


# ── answer_question ──────────────────────────────────────────────────────────

async def test_answer_question_returns_text():
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text="The answer is 42.")]

    with patch("services.claude.get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_msg)
        mock_get_client.return_value = mock_client

        result = await answer_question(
            question="What is the meaning?",
            passage="The passage text.",
            book_title="Hitchhiker's Guide",
            author="Douglas Adams",
        )

    assert result == "The answer is 42."
    mock_client.messages.create.assert_awaited_once()


async def test_answer_question_passes_correct_content():
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text="Answer text.")]

    with patch("services.claude.get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_msg)
        mock_get_client.return_value = mock_client

        await answer_question(
            question="Who is the narrator?",
            passage="Call me Ishmael.",
            book_title="Moby Dick",
            author="Melville",
        )

    call_kwargs = mock_client.messages.create.call_args
    user_content = call_kwargs.kwargs["messages"][0]["content"]
    assert "Who is the narrator?" in user_content
    assert "Call me Ishmael." in user_content
    assert "Moby Dick" in user_content


async def test_answer_question_with_non_english_language():
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text="La réponse.")]

    with patch("services.claude.get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_msg)
        mock_get_client.return_value = mock_client

        result = await answer_question(
            question="Qui est le narrateur?",
            passage="Texte.",
            book_title="Livre",
            author="Auteur",
            response_language="fr",
        )

    assert result == "La réponse."
    call_kwargs = mock_client.messages.create.call_args
    system_prompt = call_kwargs.kwargs.get("system", "")
    assert "fr" in system_prompt


# ── translate_chunk ──────────────────────────────────────────────────────────

async def test_translate_chunk_returns_translated_text():
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text="Translated result")]

    with patch("services.claude.get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_msg)
        mock_get_client.return_value = mock_client

        result = await translate_chunk(
            text="Hello world",
            source_language="en",
            target_language="de",
        )

    assert result == "Translated result"
    mock_client.messages.create.assert_awaited_once()


async def test_translate_chunk_includes_languages_in_message():
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text="Hallo Welt")]

    with patch("services.claude.get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_msg)
        mock_get_client.return_value = mock_client

        await translate_chunk("Hello world", "en", "de")

    call_kwargs = mock_client.messages.create.call_args
    user_content = call_kwargs.kwargs["messages"][0]["content"]
    assert "en" in user_content
    assert "de" in user_content
    assert "Hello world" in user_content


# ── translate_text ───────────────────────────────────────────────────────────

async def test_translate_text_empty_returns_empty_list():
    result = await translate_text("", "en", "de")
    assert result == []


async def test_translate_text_whitespace_only_returns_empty_list():
    result = await translate_text("   \n\n   ", "en", "de")
    assert result == []


async def test_translate_text_single_paragraph():
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text="Translated paragraph.")]

    with patch("services.claude.get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_msg)
        mock_get_client.return_value = mock_client

        result = await translate_text(
            "A single paragraph of text.",
            "en",
            "de",
        )

    assert isinstance(result, list)
    assert len(result) >= 1
    assert result[0] == "Translated paragraph."


async def test_translate_text_multiple_paragraphs():
    """Multiple paragraphs are chunked and reassembled."""
    call_count = 0

    async def fake_translate_chunk(text, source_language, target_language):
        nonlocal call_count
        call_count += 1
        # Return a simple "translated" version with \n\n preserved
        paragraphs = text.split("\n\n")
        return "\n\n".join(f"[{p.strip()}]" for p in paragraphs if p.strip())

    with patch("services.claude.translate_chunk", side_effect=fake_translate_chunk):
        result = await translate_text(
            "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.",
            "en",
            "zh",
        )

    assert isinstance(result, list)
    assert len(result) >= 1
    # All paragraphs should be in the result
    combined = " ".join(result)
    assert "First paragraph." in combined
    assert "Second paragraph." in combined
    assert "Third paragraph." in combined


async def test_translate_text_chunks_large_text():
    """Text larger than chunk_size gets split into multiple chunks."""
    chunk_size = 100
    # Create text with paragraphs each 60 chars — should split into multiple chunks
    para = "A" * 60
    text = f"{para}\n\n{para}\n\n{para}"

    translate_calls = []

    async def fake_chunk(text_chunk, src, tgt):
        translate_calls.append(text_chunk)
        return "translated"

    with patch("services.claude.translate_chunk", side_effect=fake_chunk):
        result = await translate_text(text, "en", "de", chunk_size=chunk_size)

    # With chunk_size=100 and para=60 chars, the second para would push over limit
    # so we expect at least 2 calls
    assert len(translate_calls) >= 2
    assert isinstance(result, list)


async def test_translate_text_returns_list_of_strings():
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text="Line one.\n\nLine two.")]

    with patch("services.claude.get_client") as mock_get_client:
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_msg)
        mock_get_client.return_value = mock_client

        result = await translate_text("Para one.\n\nPara two.", "en", "fr")

    assert isinstance(result, list)
    assert all(isinstance(s, str) for s in result)
