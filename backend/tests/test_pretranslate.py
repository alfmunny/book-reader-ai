"""Tests for scripts/pretranslate.py — chunking, chapter extraction, CLI parsing."""
import asyncio
import json
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Bootstrap the same way the script does
SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "scripts")
BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.abspath(SCRIPTS_DIR))
sys.path.insert(0, os.path.abspath(BACKEND_DIR))

import pretranslate as pt


# ── Sentence splitting ────────────────────────────────────────────────────────

def test_split_sentences_basic():
    text = "Hello world. This is a test. Another sentence here."
    parts = pt._split_sentences(text)
    assert len(parts) == 3
    assert parts[0] == "Hello world."


def test_split_sentences_empty():
    assert pt._split_sentences("") == []
    assert pt._split_sentences("   ") == []


def test_split_sentences_single():
    text = "Just one sentence with no period"
    parts = pt._split_sentences(text)
    assert parts == [text]


# ── MarianMT chunk splitting ──────────────────────────────────────────────────

def _fake_tokenizer(max_tokens: int = 100):
    """Returns a mock tokenizer that counts tokens as words."""
    tok = MagicMock()
    tok.encode = lambda text: text.split()  # 1 token per word
    return tok


def test_chunk_for_marian_short_text():
    tok = _fake_tokenizer()
    text = "Short sentence. Another one."
    chunks = pt._chunk_for_marian(tok, text)
    assert len(chunks) == 1
    assert "Short sentence" in chunks[0]


def test_chunk_for_marian_long_text():
    tok = _fake_tokenizer()
    # 3 sentences of 200 "tokens" (words) each — must split.
    # Regex requires uppercase after ". " so capitalize first word of each sentence.
    sentence = "Word " + " ".join(["word"] * 199)
    text = f"{sentence}. {sentence}. {sentence}."
    # Override MARIAN_MAX_TOKENS temporarily
    original = pt.MARIAN_MAX_TOKENS
    pt.MARIAN_MAX_TOKENS = 250
    try:
        chunks = pt._chunk_for_marian(tok, text)
        assert len(chunks) >= 2
    finally:
        pt.MARIAN_MAX_TOKENS = original


def test_chunk_for_marian_empty():
    tok = _fake_tokenizer()
    assert pt._chunk_for_marian(tok, "") == []
    assert pt._chunk_for_marian(tok, "   ") == []


# ── Chapter extraction from book rows ─────────────────────────────────────────

def test_get_chapters_from_confirmed_json():
    chapters = [
        {"title": "Chapter I", "text": "First chapter text."},
        {"title": "Chapter II", "text": "Second chapter text."},
    ]
    book = {"text_content": json.dumps({"draft": False, "chapters": chapters})}
    result = pt._get_chapters(book)
    assert len(result) == 2
    assert result[0]["title"] == "Chapter I"
    assert result[1]["text"] == "Second chapter text."


def test_get_chapters_skips_draft_json():
    book = {"text_content": json.dumps({"draft": True, "chapters": []})}
    # Draft books fall back to splitter — patch at source module
    with patch("services.splitter.build_chapters", return_value=[]) as mock_split:
        result = pt._get_chapters(book)
    mock_split.assert_called_once()


def test_get_chapters_from_gutenberg_text():
    book = {"text_content": "Chapter I\n\nSome text here.\n\nChapter II\n\nMore text."}
    with patch("services.splitter.build_chapters") as mock_split:
        mock_split.return_value = [
            MagicMock(title="Chapter I", text="Some text here."),
            MagicMock(title="Chapter II", text="More text."),
        ]
        result = pt._get_chapters(book)
    assert len(result) == 2
    assert result[0]["title"] == "Chapter I"


def test_get_chapters_empty_text():
    book = {"text_content": ""}
    with patch("services.splitter.build_chapters", return_value=[]):
        result = pt._get_chapters(book)
    assert result == []


# ── Marian language guard ─────────────────────────────────────────────────────

def test_marian_raises_for_unsupported_language():
    with pytest.raises(ValueError, match="MarianMT does not have"):
        # "xx" is not in MARIAN_PAIRS — will raise before trying to load model
        # We mock the import to avoid needing transformers installed
        with patch.dict("sys.modules", {"transformers": MagicMock()}):
            pt.MarianTranslator("xx")


def test_marian_supported_languages_listed():
    assert "de" in pt.MARIAN_PAIRS
    assert "fr" in pt.MARIAN_PAIRS
    assert "zh" in pt.MARIAN_PAIRS
    assert len(pt.MARIAN_PAIRS) >= 10


# ── OllamaTranslator ─────────────────────────────────────────────────────────

def test_ollama_connection_failure_raises():
    import requests
    with patch("requests.get", side_effect=requests.exceptions.ConnectionError("refused")):
        with pytest.raises(RuntimeError, match="Cannot connect to Ollama"):
            pt.OllamaTranslator("llama3:8b", "de")


def test_ollama_translate_paragraph():
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"response": "Hallo Welt"}
    mock_resp.raise_for_status = MagicMock()

    with patch("requests.get"):  # silence connection check
        translator = pt.OllamaTranslator.__new__(pt.OllamaTranslator)
        translator.model = "llama3:8b"
        translator.lang = "de"
        translator.base_url = "http://localhost:11434"

    with patch("requests.post", return_value=mock_resp):
        result = translator.translate_paragraph("Hello world")
    assert result == "Hallo Welt"


def test_ollama_skips_empty_paragraph():
    with patch("requests.get"):
        translator = pt.OllamaTranslator.__new__(pt.OllamaTranslator)
        translator.model = "llama3:8b"
        translator.lang = "de"
        translator.base_url = "http://localhost:11434"
    result = translator.translate_paragraph("   ")
    assert result == "   "


# ── Provider tags ─────────────────────────────────────────────────────────────

def test_marian_provider_tag():
    t = pt.MarianTranslator.__new__(pt.MarianTranslator)
    t.model_name = "Helsinki-NLP/opus-mt-en-de"
    assert "marian" in pt.MarianTranslator.provider_tag(t)


def test_ollama_provider_tag():
    t = pt.OllamaTranslator.__new__(pt.OllamaTranslator)
    t.model = "llama3:8b"
    t.lang = "de"
    t.base_url = "http://localhost:11434"
    assert t.provider_tag() == "ollama"
    assert t.model_tag() == "llama3:8b"
