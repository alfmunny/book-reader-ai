"""
Tests for services/book_chapters.py — split_with_html_preference and clear_cache.
"""

import asyncio

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

import services.book_chapters as book_chapters_module
from services.book_chapters import split_with_html_preference, clear_cache
from services.splitter import Chapter


def _make_chapters(*titles: str) -> list[Chapter]:
    return [Chapter(title=t, text=f"Text for {t}") for t in titles]


@pytest.fixture(autouse=True)
def clear_chapter_cache():
    """Start each test with an empty chapter cache."""
    clear_cache()
    yield
    clear_cache()


# ── HTML path ─────────────────────────────────────────────────────────────────

async def test_uses_html_when_available_and_has_two_or_more_chapters():
    html_chapters = _make_chapters("Chapter 1", "Chapter 2", "Chapter 3")
    with (
        patch("services.book_chapters.get_book_html", new_callable=AsyncMock, return_value="<html>...</html>"),
        patch("services.book_chapters.build_chapters_from_html", return_value=html_chapters),
        patch("services.book_chapters.build_chapters") as mock_text,
    ):
        result = await split_with_html_preference(1, "plain text")
    assert result == html_chapters
    mock_text.assert_not_called()


async def test_falls_back_to_text_when_html_produces_only_one_chapter():
    html_chapters = _make_chapters("Only One")
    text_chapters = _make_chapters("Part 1", "Part 2")
    with (
        patch("services.book_chapters.get_book_html", new_callable=AsyncMock, return_value="<html>...</html>"),
        patch("services.book_chapters.build_chapters_from_html", return_value=html_chapters),
        patch("services.book_chapters.build_chapters", return_value=text_chapters),
    ):
        result = await split_with_html_preference(2, "plain text")
    assert result == text_chapters


async def test_falls_back_when_html_fetch_returns_none():
    text_chapters = _make_chapters("Chapter A", "Chapter B")
    with (
        patch("services.book_chapters.get_book_html", new_callable=AsyncMock, return_value=None),
        patch("services.book_chapters.build_chapters", return_value=text_chapters) as mock_text,
    ):
        result = await split_with_html_preference(3, "plain text")
    assert result == text_chapters
    mock_text.assert_called_once()


async def test_falls_back_when_html_fetch_raises():
    text_chapters = _make_chapters("Fallback 1", "Fallback 2")
    with (
        patch("services.book_chapters.get_book_html", new_callable=AsyncMock, side_effect=Exception("network error")),
        patch("services.book_chapters.build_chapters", return_value=text_chapters),
    ):
        result = await split_with_html_preference(4, "plain text")
    assert result == text_chapters


async def test_falls_back_when_html_parse_raises():
    text_chapters = _make_chapters("Parse Fallback")
    with (
        patch("services.book_chapters.get_book_html", new_callable=AsyncMock, return_value="<bad html>"),
        patch("services.book_chapters.build_chapters_from_html", side_effect=Exception("parse error")),
        patch("services.book_chapters.build_chapters", return_value=text_chapters),
    ):
        result = await split_with_html_preference(5, "plain text")
    assert result == text_chapters


# ── Caching ───────────────────────────────────────────────────────────────────

async def test_cache_hit_skips_subsequent_calls():
    chapters = _make_chapters("Ch 1", "Ch 2")
    with (
        patch("services.book_chapters.get_book_html", new_callable=AsyncMock, return_value="<html>") as mock_html,
        patch("services.book_chapters.build_chapters_from_html", return_value=chapters),
    ):
        first = await split_with_html_preference(10, "text")
        second = await split_with_html_preference(10, "text")

    assert first is second
    # HTML was only fetched once
    assert mock_html.call_count == 1


async def test_different_books_are_cached_independently():
    c1 = _make_chapters("Book1 Ch1", "Book1 Ch2")
    c2 = _make_chapters("Book2 Ch1", "Book2 Ch2")
    with (
        patch("services.book_chapters.get_book_html", new_callable=AsyncMock, return_value=None),
        patch("services.book_chapters.build_chapters", side_effect=[c1, c2]),
    ):
        r1 = await split_with_html_preference(11, "text1")
        r2 = await split_with_html_preference(12, "text2")

    assert r1 == c1
    assert r2 == c2


# ── clear_cache ───────────────────────────────────────────────────────────────

async def test_clear_cache_by_book_id_forces_re_split():
    chapters_v1 = _make_chapters("Original Ch")
    chapters_v2 = _make_chapters("Updated Ch 1", "Updated Ch 2")
    with (
        patch("services.book_chapters.get_book_html", new_callable=AsyncMock, return_value=None),
        patch("services.book_chapters.build_chapters", side_effect=[chapters_v1, chapters_v2]),
    ):
        r1 = await split_with_html_preference(20, "original text")
        clear_cache(20)
        r2 = await split_with_html_preference(20, "updated text")

    assert r1 == chapters_v1
    assert r2 == chapters_v2


async def test_clear_cache_all_removes_all_books():
    chapters = _make_chapters("Ch1", "Ch2")
    with (
        patch("services.book_chapters.get_book_html", new_callable=AsyncMock, return_value=None),
        patch("services.book_chapters.build_chapters", return_value=chapters),
    ):
        await split_with_html_preference(30, "text")
        await split_with_html_preference(31, "text")

    clear_cache()
    # Both removed
    assert book_chapters_module._chapter_cache == {}


async def test_clear_cache_nonexistent_is_noop():
    clear_cache(9999)  # Should not raise


async def test_clear_cache_specific_does_not_affect_other_books():
    c1 = _make_chapters("Book A 1", "Book A 2")
    c2 = _make_chapters("Book B 1", "Book B 2")
    with (
        patch("services.book_chapters.get_book_html", new_callable=AsyncMock, return_value=None),
        patch("services.book_chapters.build_chapters", side_effect=[c1, c2]),
    ):
        await split_with_html_preference(40, "text")
        await split_with_html_preference(41, "text")

    clear_cache(40)
    assert 40 not in book_chapters_module._chapter_cache
    assert 41 in book_chapters_module._chapter_cache


# ── Concurrency ───────────────────────────────────────────────────────────────

async def test_concurrent_calls_return_identical_chapter_list():
    """Two concurrent cache-miss calls must resolve to the same chapter list.

    Without a lock, one call can take the HTML path (returning 3 chapters) and
    the other can take the text-fallback path (returning 2 chapters), causing
    translation index misalignment between the reader and the queue worker.
    """
    html_chapters = _make_chapters("HTML Ch 1", "HTML Ch 2", "HTML Ch 3")
    text_chapters = _make_chapters("Text Ch 1", "Text Ch 2")

    call_count = {"n": 0}

    async def _slow_html_fetch(_book_id):
        call_count["n"] += 1
        if call_count["n"] == 1:
            # First caller: yield so the second caller enters before HTML arrives
            await asyncio.sleep(0)
            return "<html>...</html>"
        # Second caller: HTML not available
        return None

    with (
        patch("services.book_chapters.get_book_html", side_effect=_slow_html_fetch),
        patch("services.book_chapters.build_chapters_from_html", return_value=html_chapters),
        patch("services.book_chapters.build_chapters", return_value=text_chapters),
    ):
        results = await asyncio.gather(
            split_with_html_preference(50, "plain text"),
            split_with_html_preference(50, "plain text"),
        )

    # Both callers must return the same list
    assert results[0] is results[1], (
        f"Concurrent calls returned different chapter lists: "
        f"{[c.title for c in results[0]]} vs {[c.title for c in results[1]]}"
    )
