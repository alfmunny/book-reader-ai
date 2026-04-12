"""Tests for services/translate.py — paragraph unwrapping and language mapping."""

import pytest
from services.translate import _unwrap_paragraph, _normalize_google_lang


class TestUnwrapParagraph:
    def test_joins_hard_wrapped_prose(self):
        text = "I am by birth a Genevese, and my family is one of the most\ndistinguished of that republic."
        assert _unwrap_paragraph(text) == (
            "I am by birth a Genevese, and my family is one of the most "
            "distinguished of that republic."
        )

    def test_double_newline_not_joined(self):
        # In practice _unwrap_paragraph only sees single paragraphs (split
        # upstream by \n\n), but if it did see \n\n the first \n is kept
        # because '.' is in the lookbehind set, and the second \n is kept
        # because the negative lookahead (?!\n) blocks it.
        text = "First paragraph.\n\nSecond paragraph."
        result = _unwrap_paragraph(text)
        assert "First paragraph." in result
        assert "Second paragraph." in result

    def test_preserves_line_after_sentence_end(self):
        text = "He spoke.\nShe replied."
        assert _unwrap_paragraph(text) == "He spoke.\nShe replied."

    def test_preserves_line_after_exclamation(self):
        text = "Stop!\nDo not go."
        assert _unwrap_paragraph(text) == "Stop!\nDo not go."

    def test_preserves_line_after_question(self):
        text = "Why?\nBecause I said so."
        assert _unwrap_paragraph(text) == "Why?\nBecause I said so."

    def test_preserves_line_after_colon(self):
        text = "He said:\nNothing at all."
        assert _unwrap_paragraph(text) == "He said:\nNothing at all."

    def test_preserves_line_after_closing_quote(self):
        text = 'He said "hello."\nShe waved.'
        assert _unwrap_paragraph(text) == 'He said "hello."\nShe waved.'

    def test_preserves_line_after_curly_quote(self):
        text = "He said \u201chello.\u201d\nShe waved."
        assert _unwrap_paragraph(text) == "He said \u201chello.\u201d\nShe waved."

    def test_multiple_hard_wraps(self):
        text = "one two three four five six seven eight nine ten eleven\ntwelve thirteen fourteen fifteen sixteen seventeen\neighteen nineteen twenty"
        assert "\n" not in _unwrap_paragraph(text)

    def test_empty_string(self):
        assert _unwrap_paragraph("") == ""

    def test_no_newlines(self):
        assert _unwrap_paragraph("Just one line.") == "Just one line."


class TestNormalizeGoogleLang:
    def test_chinese(self):
        assert _normalize_google_lang("zh") == "zh-CN"

    def test_portuguese(self):
        assert _normalize_google_lang("pt") == "pt-BR"

    def test_hebrew(self):
        assert _normalize_google_lang("he") == "iw"

    def test_passthrough(self):
        assert _normalize_google_lang("de") == "de"
        assert _normalize_google_lang("en") == "en"
        assert _normalize_google_lang("fr") == "fr"
