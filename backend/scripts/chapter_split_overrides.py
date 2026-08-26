"""Per-book corrections to the chapter split, applied at freeze time (#2624).

The splitter is heuristic and mis-cuts a small number of books: it promotes a
speech heading inside a scene to a chapter boundary, or matches a chapter word
inside running prose. Fossilization stores the splitter's *output*, so a
mis-cut frozen once is permanent — annotations and translations then anchor to
an invented boundary. This registry corrects the output before it becomes data.

Books absent from the registry freeze exactly as the splitter emits them.

Schema:
    OVERRIDES[book_id] = {
        'source': 'text',                       # optional; pins the split path
        'why': str,                             # required alongside 'source'
        'retitle': [
            {'index': int, 'expect_title': str, 'title': str, 'why': str},
        ],
        'merge_into_previous': [
            {'index': int,
             'expect_title': str,
             'restore_title_as': 'speaker_cue' | None,
             'why': str},
        ],
    }

Every `index` names a chapter in the splitter's **raw** output: retitles are
resolved before any merge shifts the list, so one registry entry never has to
account for another.

`source` pins which splitting path the freeze uses. The resolver prefers a
stored EPUB because it usually carries real structure, but a bad EPUB is worse
than the plain text: Pride and Prejudice #1342 ships the 1894 illustrated
edition, whose decorative drop-cap is lost in extraction (so every chapter
loses its opening letter), whose illustration captions bleed into chapter
titles, and whose plate copyright lines become paragraphs. Pinning `'text'`
selects `build_chapters` and records `chapter_source: "text"` in the artifact.

`retitle` replaces a heading the splitter invented or left as a placeholder
("Section 2" over Dracula's prefatory note). It moves nothing — indices and
paragraphs are untouched, so translations stay anchored exactly as they were.

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
    1342: {  # Pride and Prejudice
        # The stored EPUB is the 1894 George Allen illustrated edition. Its
        # extraction is materially worse than the plain text: the decorative
        # drop-cap is lost, so every chapter loses its opening letter ("It is
        # a truth…" arrives as "IT is a truth…", "Mr. Bennet was…" as "R.
        # BENNET was…"); plate copyright lines land as paragraphs; and
        # illustration captions bleed into the chapter titles ("Covering a
        # screen. CHAPTER VIII."). The plain-text split yields Austen's 61
        # chapters with clean titles and intact openings, and is what the
        # existing translations were made against.
        # Audited against Gutenberg #1342, 2026-08-26.
        "source": "text",
        "why": "illustrated EPUB drops each chapter's opening letter and "
               "pollutes titles with plate captions",
    },
    345: {  # Dracula
        # Front matter only. Dracula's split is otherwise sound: 27 numbered
        # chapters with correct boundaries, and all 30 zh entries paragraph-
        # aligned. Chapter 0 is the Grosset & Dunlap title page; chapter 1 is
        # Stoker's prefatory note, which the splitter left under a generated
        # placeholder. Both new titles match the title_translation the
        # translator already recorded (题名 / 前言), so nothing is invented.
        # Audited against Gutenberg #345, 2026-08-26.
        "retitle": [
            {
                "index": 0,
                # Non-breaking spaces, as the source sets the title page.
                "expect_title": "D\xa0R\xa0A\xa0C\xa0U\xa0L\xa0A",
                "title": "TITLE PAGE",
                "why": "publisher's title page and copyright notice, not the novel",
            },
            {
                "index": 1,
                "expect_title": "Section 2",
                "title": "PREFACE",
                "why": "Stoker's prefatory note ('How these papers have been "
                       "placed in sequence…'); 'Section 2' is a splitter placeholder",
            },
        ],
    },
    2641: {  # A Room with a View
        # The splitter matched "Chapter two" inside running prose — Lucy is
        # reading Miss Lavish's novel, and Cecil has just said "Find me chapter
        # two". The cut tore the last 15 paragraphs off Chapter XV: Lucy
        # realising the novel describes her, and George's second kiss.
        # No cue to restore — the sentence the title was built from is still
        # the chapter's first paragraph, so merging plain would duplicate it.
        # Audited against Gutenberg #2641, 2026-08-26.
        "merge_into_previous": [
            {
                "index": 15,
                "expect_title": (
                    "PART TWO — Chapter two was found, and she glanced at its "
                    "opening sentences."
                ),
                "why": "tail of Chapter XV; 'Chapter two' is narrative prose, not a heading",
            },
        ],
    },
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


def _check(
    book_id: int, chapters: list[Chapter], index: int, expect_title: str,
    *, allow_first: bool,
) -> None:
    """Verify `index` still names the chapter the registry was written against.

    `allow_first=False` for a merge, which has no predecessor to fold into at
    index 0."""
    lowest = 0 if allow_first else 1
    if not lowest <= index < len(chapters):
        raise SystemExit(
            f"book {book_id}: override index {index} is out of range for a "
            f"{len(chapters)}-chapter split — re-audit "
            f"scripts/chapter_split_overrides.py before freezing."
        )
    found = chapters[index].title
    if found != expect_title:
        raise SystemExit(
            f"book {book_id}: expected chapter {index} to be {expect_title!r} "
            f"but the splitter produced {found!r} — the split moved; re-audit "
            f"scripts/chapter_split_overrides.py before freezing."
        )


def forced_source(book_id: int) -> str | None:
    """Return the splitting path this book is pinned to, or None to let the
    resolver choose. Only 'text' is meaningful today — see the module
    docstring for why a stored EPUB is not always the better input."""
    return (OVERRIDES.get(book_id) or {}).get("source")


def _merges(spec: dict) -> list[dict]:
    """This book's merges, highest index first — the order both the chapter
    rewrite and the translation index map must apply them in, so the lower
    indices stay valid as entries are removed."""
    return sorted(
        spec.get("merge_into_previous", []), key=lambda m: m["index"], reverse=True
    )


def translation_index_map(book_id: int, num_chapters: int) -> dict[int, int]:
    """Map each raw chapter index to its index in the corrected split.

    Translations and annotations are keyed to chapter index, so a merge has to
    move them in lockstep or the repair orphans them. An absorbed chapter maps
    to the chapter that absorbed it: several old indices can therefore share
    one new index, and the caller joins their content in old-index order —
    the order the text was merged in.

    Retitles are absent by construction: they move nothing.
    """
    spec = OVERRIDES.get(book_id)
    if not spec:
        return {i: i for i in range(num_chapters)}

    # Mirror apply_overrides' pops exactly, tracking which raw indices ride
    # along in each surviving position.
    positions: list[list[int]] = [[i] for i in range(num_chapters)]
    for merge in _merges(spec):
        index = merge["index"]
        if not 0 < index < len(positions):
            raise SystemExit(
                f"book {book_id}: override index {index} is out of range for a "
                f"{len(positions)}-chapter split — re-audit "
                f"scripts/chapter_split_overrides.py before freezing."
            )
        positions[index - 1].extend(positions.pop(index))

    return {
        raw: new
        for new, raws in enumerate(positions)
        for raw in raws
    }


def apply_overrides(book_id: int, chapters: list[Chapter]) -> list[Chapter]:
    """Return `chapters` with this book's registered corrections applied.

    Raises SystemExit if a correction no longer matches the split it was
    written against — skipping silently would freeze the uncorrected boundary,
    which is the failure this registry exists to prevent.

    Callers holding anything keyed to chapter index must put it through
    translation_index_map() as well.
    """
    spec = OVERRIDES.get(book_id)
    if not spec:
        return chapters

    corrected = list(chapters)

    # Retitles first: indices in this registry name the raw split, and a
    # retitle moves nothing, so resolving them here keeps every recorded index
    # referring to the same chapter regardless of the merges below.
    for entry in spec.get("retitle", []):
        index = entry["index"]
        _check(book_id, corrected, index, entry["expect_title"], allow_first=True)
        chapter = corrected[index]
        corrected[index] = Chapter(title=entry["title"], text=chapter.text)

    for merge in _merges(spec):
        index = merge["index"]
        _check(book_id, corrected, index, merge["expect_title"], allow_first=False)

        absorbed = corrected.pop(index)
        text = absorbed.text
        if merge.get("restore_title_as") == "speaker_cue":
            text = f"{absorbed.title}\n{text}"
        previous = corrected[index - 1]
        corrected[index - 1] = Chapter(
            title=previous.title, text=f"{previous.text}\n\n{text}"
        )

    return corrected
