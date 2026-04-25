"""Per-book overrides for the translation alignment checker (#1073).

The checker's verse-vs-prose classifier is heuristic. Some books legitimately
need explicit per-book pinning — Faust is verse-and-prose mixed, Moby Dick
has occasional inset hymns inside prose chapters, etc. This registry lets us
encode that knowledge as code without bloating the heuristic.

Books not in the registry fall through to the heuristic (zero-config for new
books).

Schema:
    OVERRIDES[book_id] = {
        'source_language': 'de' | 'fr' | 'en' | 'ru' | …,
        'verse_chapters': 'all' | list[int] | None,
            # 'all'   = every chapter is verse
            # [3, 8] = chapter indices 3 and 8 are verse, others heuristic
            # None  = pure heuristic (default)
        'verse_paragraph_indices': dict[int, list[int]] | None,
            # per-chapter verse paragraph index list. Wins over `verse_chapters`
            # for those chapters. e.g. {42: [3, 7]} means in chapter 42,
            # paragraphs 3 and 7 are verse, the rest is prose.
    }

Adding a book: append an entry. Keep entries minimal — only override what
the heuristic gets wrong.
"""

from __future__ import annotations

OVERRIDES: dict[int, dict] = {
    2229: {  # Goethe — Faust I & II
        "source_language": "de",
        "verse_chapters": "all",
    },
    24288: {  # Rilke — Das Stunden-Buch
        "source_language": "de",
        "verse_chapters": "all",
    },
    14155: {  # Flaubert — Madame Bovary
        "source_language": "fr",
        "verse_chapters": [],
    },
    2701: {  # Melville — Moby Dick
        "source_language": "en",
        "verse_chapters": [],
    },
    1342: {  # Austen — Pride and Prejudice
        "source_language": "en",
        "verse_chapters": [],
    },
    1513: {  # Shakespeare — Romeo and Juliet
        "source_language": "en",
        "verse_chapters": "all",
    },
    84: {  # Shelley — Frankenstein
        "source_language": "en",
        "verse_chapters": [],
    },
}


def get_override(book_id: int) -> dict:
    return OVERRIDES.get(book_id, {})
