"""Per-book corrections to the chapter split, applied at freeze time (#2624).

The splitter is heuristic and mis-cuts a small number of books: it promotes a
speech heading inside a scene to a chapter boundary, or matches a chapter word
inside running prose. Fossilization stores the splitter's *output*, so a
mis-cut frozen once is permanent — annotations and translations then anchor to
an invented boundary. This registry corrects the output before it becomes data.

Books absent from the registry freeze exactly as the splitter emits them.

Schema:
    OVERRIDES[book_id] = {
        'merge_into_previous': [
            {'index': int,
             'expect_title': str,
             'restore_title_as': 'speaker_cue' | None,
             'why': str},
        ],
    }

`merge_into_previous` appends chapter `index` to its predecessor and removes
it, shifting later chapters down by one. `expect_title` is verified first: if
the splitter's output has moved, the freeze aborts rather than merging the
wrong chapter. `restore_title_as: 'speaker_cue'` puts the consumed title back
as the cue line of the merged text ("PROLOGUE.\\nFor us, and for our
tragedy…") — the splitter ate a speaker cue to build the heading, so merging
without restoring it would drop a line of the play.

When to use: a split audit finds a boundary the splitter invented. Prefer this
over editing services/splitter.py — a rule general enough to fix one book
usually breaks another (Hamlet's 'PROLOGUE.' is a speaker cue; Romeo and
Juliet's 'THE PROLOGUE' is a real chapter).

Example
-------
    from scripts.chapter_split_overrides import apply_overrides
    chapters = apply_overrides(1524, chapters)

Adding a book: append an entry whose `why` names the structure in the source.
"""

from __future__ import annotations

from services.splitter import Chapter

OVERRIDES: dict[int, dict] = {
    1524: {  # Hamlet
        "merge_into_previous": [
            {
                "index": 9,
                "expect_title": "PROLOGUE.",
                "restore_title_as": "speaker_cue",
                "why": (
                    "The Player Prologue's speaker cue inside ACT III SCENE II "
                    "— the preceding chapter ends on 'Enter Prologue.' The cut "
                    "split the play scene in two and swallowed the rest of it."
                ),
            },
        ],
    },
}


def apply_overrides(book_id: int, chapters: list[Chapter]) -> list[Chapter]:
    """Return `chapters` with this book's registered corrections applied.

    Raises SystemExit if a correction no longer matches the split it was
    written against — skipping silently would freeze the uncorrected boundary,
    which is the failure this registry exists to prevent.
    """
    spec = OVERRIDES.get(book_id)
    if not spec:
        return chapters

    corrected = list(chapters)
    # Highest index first, so the lower indices stay valid as entries are removed.
    for merge in sorted(
        spec.get("merge_into_previous", []), key=lambda m: m["index"], reverse=True
    ):
        index = merge["index"]
        if not 0 < index < len(corrected):
            raise SystemExit(
                f"book {book_id}: merge_into_previous index {index} is out of "
                f"range for a {len(corrected)}-chapter split — re-audit "
                f"scripts/chapter_split_overrides.py before freezing."
            )
        found = corrected[index].title
        if found != merge["expect_title"]:
            raise SystemExit(
                f"book {book_id}: expected chapter {index} to be "
                f"{merge['expect_title']!r} but the splitter produced {found!r} "
                f"— the split moved; re-audit "
                f"scripts/chapter_split_overrides.py before freezing."
            )

        absorbed = corrected.pop(index)
        text = absorbed.text
        if merge.get("restore_title_as") == "speaker_cue":
            text = f"{absorbed.title}\n{text}"
        previous = corrected[index - 1]
        corrected[index - 1] = Chapter(
            title=previous.title, text=f"{previous.text}\n\n{text}"
        )

    return corrected
