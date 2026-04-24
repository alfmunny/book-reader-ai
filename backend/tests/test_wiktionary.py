"""Tests for services/wiktionary.py."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from services.wiktionary import lookup, _extract_lemma, _strip_html, ai_lookup


# ── _strip_html ────────────────────────────────────────────────────────────────

def test_strip_html_removes_tags():
    assert _strip_html("<b>hello</b> world") == "hello world"


def test_strip_html_empty():
    assert _strip_html("") == ""


def test_strip_html_removes_style_block_with_css():
    """CSS inside <style> must not appear in output — this is the bug fix for
    Wiktionary returning inline <style> blocks whose class names bled into text."""
    html = (
        'to assist'
        '<style>.mw-parser-output .object-usage-tag{font-style:italic}'
        '.mw-parser-output .deprecated{color:var(--wikt,olivedrab)}</style>'
        '{with dative}'
    )
    result = _strip_html(html)
    assert ".mw-parser-output" not in result
    assert "font-style" not in result
    assert "to assist" in result
    assert "{with dative}" in result


def test_strip_html_removes_script_block():
    html = 'safe text<script>alert("xss")</script> more text'
    result = _strip_html(html)
    assert "alert" not in result
    assert "safe text" in result
    assert "more text" in result


def test_strip_html_multiline_style_block():
    html = 'word<style>\n.cls { color: red; }\n</style>definition'
    result = _strip_html(html)
    assert "color" not in result
    assert "word" in result
    assert "definition" in result


# ── _extract_lemma ─────────────────────────────────────────────────────────────

def test_extract_lemma_bold_tag():
    html = "past participle of <b class='Latn'>gehen</b>"
    assert _extract_lemma(html, "gegangen") == "gehen"


def test_extract_lemma_anchor_tag():
    html = "plural of <a href='./Buch'>Buch</a>"
    assert _extract_lemma(html, "bücher") == "Buch"


def test_extract_lemma_no_form_of():
    html = "a large marine mammal"
    assert _extract_lemma(html, "whale") is None


def test_extract_lemma_same_as_current_word():
    html = "plural of <b>whale</b>"
    assert _extract_lemma(html, "whale") is None


def test_extract_lemma_plain_of():
    html = "simple past of run"
    assert _extract_lemma(html, "ran") == "run"


# ── lookup ─────────────────────────────────────────────────────────────────────

def _make_mock_response(status_code: int, json_data: dict):
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_data
    return mock


@pytest.mark.asyncio
async def test_lookup_returns_empty_on_http_error():
    with patch("services.wiktionary.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=_make_mock_response(404, {}))

        result = await lookup("nonexistent", "en")
        assert result["lemma"] == "nonexistent"
        assert result["definitions"] == []


@pytest.mark.asyncio
async def test_lookup_returns_empty_on_exception():
    with patch("services.wiktionary.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=Exception("network error"))

        result = await lookup("word", "en")
        assert result["lemma"] == "word"
        assert result["definitions"] == []


@pytest.mark.asyncio
async def test_lookup_extracts_definitions():
    json_data = {
        "en": [
            {
                "partOfSpeech": "noun",
                "definitions": [
                    {"definition": "A large aquatic mammal."},
                    {"definition": "An overwhelming amount."},
                ],
            }
        ]
    }
    with patch("services.wiktionary.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=_make_mock_response(200, json_data))

        result = await lookup("whale", "en")
        assert result["lemma"] == "whale"
        assert len(result["definitions"]) == 2
        assert result["definitions"][0]["pos"] == "noun"
        assert "aquatic" in result["definitions"][0]["text"]
        assert result["url"] == "https://en.wiktionary.org/wiki/whale"


@pytest.mark.asyncio
async def test_lookup_extracts_lemma_from_form_of():
    json_data = {
        "de": [
            {
                "partOfSpeech": "verb",
                "definitions": [
                    {"definition": "past participle of <b class='Latn'>gehen</b>"},
                ],
            }
        ]
    }
    with patch("services.wiktionary.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=_make_mock_response(200, json_data))

        result = await lookup("gegangen", "de")
        assert result["lemma"] == "gehen"
        assert result["language"] == "de"


@pytest.mark.asyncio
async def test_lookup_caps_definitions_at_three():
    json_data = {
        "en": [
            {
                "partOfSpeech": "noun",
                "definitions": [{"definition": f"Def {i}"} for i in range(5)],
            }
        ]
    }
    with patch("services.wiktionary.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=_make_mock_response(200, json_data))

        result = await lookup("word", "en")
        assert len(result["definitions"]) <= 3


@pytest.mark.asyncio
async def test_lookup_falls_back_to_en_if_lang_missing():
    json_data = {
        "en": [
            {
                "partOfSpeech": "noun",
                "definitions": [{"definition": "A test word."}],
            }
        ]
    }
    with patch("services.wiktionary.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=_make_mock_response(200, json_data))

        result = await lookup("word", "fr")
        assert len(result["definitions"]) == 1


# ── lookup edge cases ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_lookup_skips_empty_definitions_after_html_strip():
    """Definitions that are empty after HTML stripping are skipped."""
    json_data = {
        "en": [
            {
                "partOfSpeech": "noun",
                "definitions": [
                    {"definition": "<span></span>"},   # becomes empty after strip → skipped
                    {"definition": "A real definition."},
                ],
            }
        ]
    }
    with patch("services.wiktionary.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=_make_mock_response(200, json_data))

        result = await lookup("word", "en")
        assert len(result["definitions"]) == 1
        assert result["definitions"][0]["text"] == "A real definition."


@pytest.mark.asyncio
async def test_lookup_invalid_json_returns_empty():
    """If resp.json() raises, lookup returns empty definitions."""
    with patch("services.wiktionary.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        bad_resp = MagicMock()
        bad_resp.status_code = 200
        bad_resp.json.side_effect = ValueError("not json")
        mock_client.get = AsyncMock(return_value=bad_resp)

        result = await lookup("word", "en")
        assert result["definitions"] == []


@pytest.mark.asyncio
async def test_lookup_lemma_only_extracted_from_first_definition():
    """Lemma extraction (via _extract_lemma) is attempted only on the first definition."""
    json_data = {
        "de": [
            {
                "partOfSpeech": "verb",
                "definitions": [
                    {"definition": "simple past of <b>go</b>"},
                    {"definition": "another form of <b>walk</b>"},  # should NOT update lemma
                ],
            }
        ]
    }
    with patch("services.wiktionary.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=_make_mock_response(200, json_data))

        result = await lookup("went", "de")
        # Lemma from first definition only
        assert result["lemma"] == "go"
        # Second definition body still present
        assert len(result["definitions"]) == 2


# ── URL encoding (regression for #612) ────────────────────────────────────────

@pytest.mark.anyio
async def test_lookup_word_with_hash_uses_encoded_url():
    """A word containing '#' must have it percent-encoded in the API URL so the
    fragment is not stripped by httpx before reaching the server."""
    captured_urls: list[str] = []

    async def fake_get(url, **kwargs):
        captured_urls.append(url)
        resp = MagicMock()
        resp.status_code = 404
        return resp

    with patch("services.wiktionary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = fake_get
        await lookup("foo#bar", "en")

    assert len(captured_urls) == 1
    assert "#" not in captured_urls[0], (
        "URL must not contain a raw '#' — it should be percent-encoded as %23"
    )
    assert "%23" in captured_urls[0]


@pytest.mark.anyio
async def test_lookup_word_with_question_mark_uses_encoded_url():
    """A word containing '?' must have it percent-encoded so it is not treated
    as the start of a query string."""
    captured_urls: list[str] = []

    async def fake_get(url, **kwargs):
        captured_urls.append(url)
        resp = MagicMock()
        resp.status_code = 404
        return resp

    with patch("services.wiktionary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = fake_get
        await lookup("foo?bar", "en")

    assert len(captured_urls) == 1
    assert "?" not in captured_urls[0], (
        "URL must not contain a raw '?' — it should be percent-encoded as %3F"
    )
    assert "%3F" in captured_urls[0]


@pytest.mark.anyio
async def test_lookup_word_with_special_chars_wikt_url_is_encoded():
    """The display URL returned in the result must also be percent-encoded."""
    with patch("services.wiktionary.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=MagicMock(status_code=404))
        result = await lookup("foo#bar", "en")
    assert "#" not in result["url"]
    assert "%23" in result["url"]


# ── ai_lookup (fallback for #444) ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ai_lookup_returns_definition():
    """ai_lookup calls Gemini and parses a JSON definition response."""
    gemini_json = '{"lemma":"laufen","definitions":[{"pos":"verb","text":"to run"}]}'
    with patch("services.gemini._generate", new=AsyncMock(return_value=gemini_json)):
        result = await ai_lookup("lief", "de", api_key="test-key")
    assert result["lemma"] == "laufen"
    assert len(result["definitions"]) == 1
    assert result["definitions"][0]["pos"] == "verb"
    assert result["language"] == "de"


@pytest.mark.asyncio
async def test_ai_lookup_returns_empty_on_bad_json():
    """If Gemini returns unparseable output, ai_lookup returns empty definitions."""
    with patch("services.gemini._generate", new=AsyncMock(return_value="not json")):
        result = await ai_lookup("word", "en", api_key="test-key")
    assert result["definitions"] == []
    assert result["lemma"] == "word"


@pytest.mark.asyncio
async def test_ai_lookup_returns_empty_on_exception():
    """If Gemini raises, ai_lookup returns empty definitions."""
    with patch("services.gemini._generate", new=AsyncMock(side_effect=Exception("api error"))):
        result = await ai_lookup("word", "en", api_key="test-key")
    assert result["definitions"] == []


@pytest.mark.asyncio
async def test_ai_lookup_url_is_empty_string():
    """ai_lookup must return url='' — not a Wiktionary link — because wiktionary
    had no entry for this word (that's why AI was called). Closes #551."""
    gemini_json = '{"lemma":"Aufmerksamkeit","definitions":[{"pos":"noun","text":"attention"}]}'
    with patch("services.gemini._generate", new=AsyncMock(return_value=gemini_json)):
        result = await ai_lookup("Aufmerksamkeitsdefizit", "de", api_key="test-key")
    assert result["url"] == "", (
        "AI fallback must not return a Wiktionary URL — the user would land on a missing page"
    )
