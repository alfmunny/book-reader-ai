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


# ── translate_chapters_batch ─────────────────────────────────────────────────

def _mock_gemini_response(text: str, finish_reason: str | None = "STOP"):
    """Build a Gemini-style response object whose .text returns `text`.

    Supplies a minimal `candidates[0].finish_reason` too so the parser
    can detect MAX_TOKENS truncation / SAFETY blocks the way the real
    client reports them.
    """
    class _Candidate:
        pass

    class _Resp:
        pass

    cand = _Candidate()
    cand.finish_reason = finish_reason

    r = _Resp()
    r.text = text
    r.candidates = [cand]
    return r


def _patch_gemini_generate(return_text: str, finish_reason: str | None = "STOP"):
    """Patch the underlying google-genai client used by translate_chapters_batch."""
    async_mock = AsyncMock(return_value=_mock_gemini_response(return_text, finish_reason))

    class _Models:
        generate_content = async_mock

    class _Aio:
        models = _Models()

    class _Client:
        aio = _Aio()

    return patch("services.gemini._client", return_value=_Client()), async_mock


async def test_translate_chapters_batch_parses_multiple_chapters():
    """The function should extract each <chapter> block and return a dict by index."""
    response = """<chapter index="0">
First chapter translated.

Second paragraph of chapter 0.
</chapter>

<chapter index="1">
Chapter 1 text.
</chapter>"""
    patcher, mock = _patch_gemini_generate(response)
    with patcher:
        result = await gemini.translate_chapters_batch(
            "key",
            [(0, "Chapter 0 original"), (1, "Chapter 1 original")],
            "en", "zh",
        )
    assert set(result.keys()) == {0, 1}
    assert len(result[0]) == 2
    assert result[0][0].startswith("First chapter")
    assert result[1][0] == "Chapter 1 text."


async def test_translate_chapters_batch_preserves_index_attribute():
    """Non-sequential indices (e.g. 5 and 9) must round-trip correctly."""
    response = '<chapter index="5">Five.</chapter>\n<chapter index="9">Nine.</chapter>'
    patcher, _ = _patch_gemini_generate(response)
    with patcher:
        result = await gemini.translate_chapters_batch(
            "key", [(5, "A"), (9, "B")], "en", "zh",
        )
    assert set(result.keys()) == {5, 9}


async def test_translate_chapters_batch_empty_input():
    """Empty input short-circuits, no API call."""
    result = await gemini.translate_chapters_batch("key", [], "en", "zh")
    assert result == {}


async def test_translate_chapters_batch_includes_prior_context():
    """prior_context text appears in the prompt (for cross-batch consistency)."""
    patcher, mock = _patch_gemini_generate('<chapter index="0">x</chapter>')
    with patcher:
        await gemini.translate_chapters_batch(
            "key", [(0, "New chapter")], "en", "zh",
            prior_context="[previously translated content]",
        )
    called_prompt = mock.call_args.kwargs["contents"]
    assert "[previously translated content]" in called_prompt
    assert "<context>" in called_prompt


async def test_translate_chapters_batch_raises_on_unparseable_response():
    """If the model returns no <chapter> tags in a multi-chapter batch,
    we raise so caller can fall back — ambiguous which chapter is which."""
    patcher, _ = _patch_gemini_generate("Just some text with no tags.")
    with patcher:
        with pytest.raises(ValueError, match="no <chapter> blocks"):
            await gemini.translate_chapters_batch(
                "key", [(0, "text"), (1, "text")], "en", "zh",
            )


async def test_translate_chapters_batch_single_chapter_plain_text_fallback():
    """Flash-lite sometimes drops the <chapter> wrapping on small inputs.
    When we sent exactly ONE chapter and Gemini finished cleanly (STOP),
    treat the whole plain-text response as that chapter's translation
    instead of failing the batch."""
    patcher, _ = _patch_gemini_generate(
        "Erster Absatz der Übersetzung.\n\nZweiter Absatz.",
        finish_reason="STOP",
    )
    with patcher:
        result = await gemini.translate_chapters_batch(
            "key", [(7, "One-chapter payload.")], "en", "de",
        )
    assert result == {7: ["Erster Absatz der Übersetzung.", "Zweiter Absatz."]}


async def test_translate_chapters_batch_does_not_fallback_when_truncated():
    """If finish_reason=MAX_TOKENS the response is incomplete and we
    should NOT trust plain text as the translation — the chain advance
    has to pick it up so a bigger-context model can retry."""
    patcher, _ = _patch_gemini_generate(
        "Partial translation that got c",
        finish_reason="MAX_TOKENS",
    )
    with patcher:
        with pytest.raises(ValueError, match="MAX_TOKENS"):
            await gemini.translate_chapters_batch(
                "key", [(0, "text")], "en", "zh",
            )


async def test_translate_chapters_batch_splits_oversized_single_chapter():
    """A single chapter whose estimated output exceeds max_output_tokens
    must be split into paragraph-aligned sub-chunks, each translated
    via its own API call. Prevents mid-chapter MAX_TOKENS truncation
    on flash-tier models for long dramatic scenes."""
    # 6 source paragraphs, 50 words each → ~420 est output tokens total
    # with our 1.4 words/token heuristic. With max_output_tokens=200
    # and 10% headroom = 180 target, we expect the splitter to make
    # 3–4 sub-chunks.
    words = " ".join(["word"] * 50)
    source_paragraphs = [f"Source paragraph {i}. {words}" for i in range(6)]
    source_text = "\n\n".join(source_paragraphs)

    call_count = {"n": 0}

    def fake_response_for(prompt: str) -> str:
        # Return one <chapter> block per call, with two translated
        # paragraphs per sub-chunk — enough to verify concatenation order.
        call_count["n"] += 1
        n = call_count["n"]
        return (
            f'<chapter index="5">\n'
            f'Chunk {n} translated paragraph A.\n\n'
            f'Chunk {n} translated paragraph B.\n'
            f'</chapter>'
        )

    async def fake_generate(*, model, contents, config):
        return _mock_gemini_response(fake_response_for(contents))

    class _Models:
        generate_content = AsyncMock(side_effect=fake_generate)

    class _Aio:
        models = _Models()

    class _Client:
        aio = _Aio()

    with patch("services.gemini._client", return_value=_Client()):
        result = await gemini.translate_chapters_batch(
            "key", [(5, source_text)], "en", "zh",
            max_output_tokens=200,
        )

    # Multiple API calls happened — the chapter was chunked.
    assert call_count["n"] >= 2
    # Result aggregates paragraphs from every sub-chunk in order.
    paragraphs = result[5]
    assert len(paragraphs) == 2 * call_count["n"]
    assert paragraphs[0].startswith("Chunk 1")
    assert paragraphs[-1].startswith(f"Chunk {call_count['n']}")


async def test_translate_chapters_batch_under_budget_does_not_split():
    """Regression guard: normally-sized chapters still go out as a
    single API call (no accidental over-splitting)."""
    patcher, mock = _patch_gemini_generate(
        '<chapter index="0">Only one paragraph.</chapter>',
    )
    with patcher:
        result = await gemini.translate_chapters_batch(
            "key", [(0, "Short text.")], "en", "zh",
            max_output_tokens=8192,
        )
    assert result == {0: ["Only one paragraph."]}
    assert mock.await_count == 1


async def test_translate_chapters_batch_error_includes_raw_preview():
    """The error message must include a preview of what the model
    actually returned so admins can tell truncation apart from a
    format-ignored response without re-running the call with extra
    logging."""
    patcher, _ = _patch_gemini_generate(
        "I am sorry, I cannot translate this content.",
        finish_reason="STOP",
    )
    with patcher:
        # Multi-chapter batch so the single-chapter fallback doesn't apply.
        with pytest.raises(ValueError, match="I am sorry"):
            await gemini.translate_chapters_batch(
                "key", [(0, "t"), (1, "t")], "en", "zh",
            )
