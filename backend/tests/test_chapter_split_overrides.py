"""Tests for scripts/chapter_split_overrides.py — freeze-time corrections to
splitter output (#2624).

The registry exists because fossilization stores the splitter's *output*: a
boundary the splitter invents is permanent once frozen, and every later
annotation anchors to it. Hamlet #1524 is the first entry — the text splitter
promoted the Player Prologue's speaker cue inside III.ii to a chapter,
cutting the play scene in two.
"""

import json
import re
from pathlib import Path

import pytest

import scripts.chapter_split_overrides as overrides_module
from scripts.chapter_split_overrides import (
    apply_overrides,
    forced_source,
    translation_index_map,
)
from services.splitter import Chapter

REPO_ROOT = Path(__file__).resolve().parents[2]
HAMLET_ARTIFACT = REPO_ROOT / "data" / "books" / "book_1524.json"


def _scene_split():
    """A miniature of the Hamlet mis-cut: a speaker cue promoted to chapter 2."""
    return [
        Chapter(title="ACT III", text="SCENE I.\n\nTo be, or not to be."),
        Chapter(
            title="SCENE II. A hall in the Castle.",
            text="Enter Hamlet and certain Players.\n\nEnter Prologue.",
        ),
        Chapter(
            title="PROLOGUE.",
            text="   _For us, and for our tragedy,_\n\nHAMLET.\nIs this a prologue?",
        ),
        Chapter(title="SCENE III. A room in the Castle.", text="Enter King."),
    ]


@pytest.fixture
def registry(monkeypatch):
    """Point the registry at book 999 so tests don't depend on real entries."""
    def _install(spec):
        monkeypatch.setattr(overrides_module, "OVERRIDES", {999: spec})
    return _install


def test_unregistered_book_is_returned_untouched():
    chapters = _scene_split()
    assert apply_overrides(4242, chapters) == chapters


def test_merge_folds_chapter_into_predecessor_and_shifts_the_tail(registry):
    registry({"merge_into_previous": [
        {"index": 2, "expect_title": "PROLOGUE.", "restore_title_as": "speaker_cue"},
    ]})

    result = apply_overrides(999, _scene_split())

    assert [c.title for c in result] == [
        "ACT III",
        "SCENE II. A hall in the Castle.",
        "SCENE III. A room in the Castle.",
    ]


def test_merge_restores_the_consumed_title_as_a_speaker_cue(registry):
    """The splitter ate 'PROLOGUE.' to build the heading. Merging without
    putting it back would silently drop a line of the play."""
    registry({"merge_into_previous": [
        {"index": 2, "expect_title": "PROLOGUE.", "restore_title_as": "speaker_cue"},
    ]})

    merged = apply_overrides(999, _scene_split())[1].text

    # Predecessor's text is intact, the cue is restored, and the verse keeps
    # its original indentation.
    assert merged.startswith("Enter Hamlet and certain Players.\n\nEnter Prologue.")
    assert "PROLOGUE.\n   _For us, and for our tragedy,_" in merged
    assert merged.endswith("HAMLET.\nIs this a prologue?")


def test_merge_without_cue_restoration_drops_the_heading(registry):
    registry({"merge_into_previous": [{"index": 2, "expect_title": "PROLOGUE."}]})

    merged = apply_overrides(999, _scene_split())[1].text

    assert "PROLOGUE." not in merged
    assert "_For us, and for our tragedy,_" in merged


def test_paragraph_count_is_conserved_by_a_merge(registry):
    """A merge must not create or destroy paragraphs — translations key on
    paragraph index, so a drift here would mis-anchor paid work (#2634)."""
    registry({"merge_into_previous": [
        {"index": 2, "expect_title": "PROLOGUE.", "restore_title_as": "speaker_cue"},
    ]})
    before = _scene_split()

    after = apply_overrides(999, before)

    def paragraphs(chapters):
        return sum(len(c.text.split("\n\n")) for c in chapters)

    assert paragraphs(after) == paragraphs(before)


def test_title_mismatch_aborts_rather_than_merging_the_wrong_chapter(registry):
    """If the splitter's output moved, the recorded index now points at
    something else — abort instead of silently corrupting a good boundary."""
    registry({"merge_into_previous": [
        {"index": 2, "expect_title": "EPILOGUE.", "restore_title_as": "speaker_cue"},
    ]})

    with pytest.raises(SystemExit, match="expected chapter 2"):
        apply_overrides(999, _scene_split())


def test_out_of_range_index_aborts(registry):
    registry({"merge_into_previous": [{"index": 99, "expect_title": "PROLOGUE."}]})

    with pytest.raises(SystemExit, match="out of range"):
        apply_overrides(999, _scene_split())


def test_index_zero_aborts_having_no_predecessor(registry):
    registry({"merge_into_previous": [{"index": 0, "expect_title": "ACT III"}]})

    with pytest.raises(SystemExit, match="out of range"):
        apply_overrides(999, _scene_split())


def test_multiple_merges_apply_highest_index_first(registry):
    """Later merges must not invalidate earlier indices."""
    registry({"merge_into_previous": [
        {"index": 1, "expect_title": "SCENE II. A hall in the Castle."},
        {"index": 3, "expect_title": "SCENE III. A room in the Castle."},
    ]})

    result = apply_overrides(999, _scene_split())

    assert [c.title for c in result] == ["ACT III", "PROLOGUE."]


# ── retitle ──────────────────────────────────────────────────────────────────

def test_retitle_replaces_a_title_without_moving_anything(registry):
    registry({"retitle": [
        {"index": 1, "expect_title": "SCENE II. A hall in the Castle.",
         "title": "THE PLAY SCENE"},
    ]})
    before = _scene_split()

    result = apply_overrides(999, before)

    assert [c.title for c in result] == [
        "ACT III", "THE PLAY SCENE", "PROLOGUE.",
        "SCENE III. A room in the Castle.",
    ]
    # Paragraph content is untouched — translations key on it.
    assert [c.text for c in result] == [c.text for c in before]


def test_retitle_aborts_on_a_title_mismatch(registry):
    registry({"retitle": [
        {"index": 1, "expect_title": "SOMETHING ELSE", "title": "X"},
    ]})

    with pytest.raises(SystemExit, match="expected chapter 1"):
        apply_overrides(999, _scene_split())


def test_retitle_aborts_when_the_index_is_out_of_range(registry):
    registry({"retitle": [{"index": 99, "expect_title": "X", "title": "Y"}]})

    with pytest.raises(SystemExit, match="out of range"):
        apply_overrides(999, _scene_split())


def test_retitle_indices_refer_to_the_raw_split_not_the_merged_one(registry):
    """Every index in the registry names a chapter in the splitter's raw
    output, so retitles resolve before merges shift anything."""
    registry({
        "retitle": [{"index": 3, "expect_title": "SCENE III. A room in the Castle.",
                     "title": "THE CLOSET SCENE"}],
        "merge_into_previous": [{"index": 2, "expect_title": "PROLOGUE."}],
    })

    result = apply_overrides(999, _scene_split())

    assert [c.title for c in result] == [
        "ACT III", "SCENE II. A hall in the Castle.", "THE CLOSET SCENE",
    ]


# ── translation_index_map ────────────────────────────────────────────────────

def test_index_map_is_identity_for_an_unregistered_book():
    assert translation_index_map(4242, 4) == {0: 0, 1: 1, 2: 2, 3: 3}


def test_index_map_is_identity_when_only_retitles_are_registered(registry):
    """A retitle moves nothing, so nothing keyed to chapter index moves."""
    registry({"retitle": [{"index": 0, "expect_title": "ACT III", "title": "X"}]})

    assert translation_index_map(999, 4) == {0: 0, 1: 1, 2: 2, 3: 3}


def test_index_map_shifts_everything_after_a_merge_down(registry):
    """Regression: A Room with a View's only translation sat at index 20 and
    had to land on 19 when chapter 15 was folded away — without this, the
    repair orphans it."""
    registry({"merge_into_previous": [{"index": 2, "expect_title": "PROLOGUE."}]})

    # 2 is absorbed into 1; 3 slides down into its place.
    assert translation_index_map(999, 4) == {0: 0, 1: 1, 2: 1, 3: 2}


def test_index_map_agrees_with_apply_overrides_on_length(registry):
    registry({"merge_into_previous": [
        {"index": 1, "expect_title": "SCENE II. A hall in the Castle."},
        {"index": 3, "expect_title": "SCENE III. A room in the Castle."},
    ]})
    chapters = _scene_split()

    mapping = translation_index_map(999, len(chapters))

    assert len(set(mapping.values())) == len(apply_overrides(999, chapters))


def test_index_map_rejects_an_out_of_range_merge(registry):
    registry({"merge_into_previous": [{"index": 99, "expect_title": "X"}]})

    with pytest.raises(SystemExit, match="out of range"):
        translation_index_map(999, 4)


# ── The committed Hamlet artifact (#1524) ────────────────────────────────────

def test_hamlet_artifact_has_no_standalone_prologue_chapter():
    """Regression: 'PROLOGUE.' is a speaker cue inside ACT III SCENE II, not
    a chapter. Freezing it as one cut the play scene in two."""
    artifact = json.loads(HAMLET_ARTIFACT.read_text())

    titles = [c["title"] for c in artifact["chapters"]]
    assert "PROLOGUE." not in titles
    assert len(titles) == 20, "Hamlet is 20 scenes across five acts"


def test_hamlet_play_scene_is_whole_and_keeps_the_prologue_cue():
    artifact = json.loads(HAMLET_ARTIFACT.read_text())
    play_scene = next(
        c for c in artifact["chapters"]
        if c["title"] == "SCENE II. A hall in the Castle." and c["index"] < 15
    )

    joined = "\n\n".join(play_scene["paragraphs"])
    # The cue sits with its speech, as every other speech in the play does.
    assert any(p.startswith("PROLOGUE.\n") for p in play_scene["paragraphs"])
    # The scene runs from the players' entrance through to the King's exit.
    assert joined.startswith("Enter Hamlet and certain Players.")
    assert "Enter Prologue." in joined
    assert "Is this a prologue, or the posy of a ring?" in joined


# ── The committed Dracula artifact (#345) ────────────────────────────────────

DRACULA_ARTIFACT = REPO_ROOT / "data" / "books" / "book_345.json"


def test_dracula_frontmatter_titles_are_meaningful():
    """'Section 2' was a splitter-generated placeholder over Stoker's
    prefatory note; the zh title_translation already read 前言."""
    artifact = json.loads(DRACULA_ARTIFACT.read_text())

    titles = [c["title"] for c in artifact["chapters"]]
    assert "Section 2" not in titles
    assert titles[0] == "TITLE PAGE"
    assert titles[1] == "PREFACE"


def test_dracula_keeps_all_thirty_chapters_and_translations_aligned():
    """The retitle must not move a boundary: Dracula's 27 numbered chapters
    plus front matter, preface and closing note all stay where they were,
    with every zh entry still paragraph-aligned."""
    artifact = json.loads(DRACULA_ARTIFACT.read_text())
    chapters = artifact["chapters"]
    entries = artifact["translations"]["zh"]["chapters"]

    assert len(chapters) == 30
    assert len(entries) == 30
    numbered = [c["title"] for c in chapters if c["title"].startswith("CHAPTER ")]
    assert len(numbered) == 27
    for e in entries:
        assert len(e["paragraphs"]) == len(chapters[e["index"]]["paragraphs"])


# ── The committed A Room with a View artifact (#2641) ────────────────────────

RWAV_ARTIFACT = REPO_ROOT / "data" / "books" / "book_2641.json"


def test_rwav_has_no_chapter_invented_from_prose():
    """Regression: the splitter matched "Chapter two" inside narrative prose —
    Lucy reading Miss Lavish's novel — and tore the last 15 paragraphs off
    Chapter XV."""
    artifact = json.loads(RWAV_ARTIFACT.read_text())

    titles = [c["title"] for c in artifact["chapters"]]
    assert not any("Chapter two was found" in t for t in titles)
    assert len(titles) == 20, "A Room with a View is 20 chapters"


def test_rwav_chapter_xv_is_whole():
    artifact = json.loads(RWAV_ARTIFACT.read_text())
    chapter = next(c for c in artifact["chapters"]
                   if c["title"] == "PART TWO — Chapter XV")

    # The source hard-wraps lines inside paragraphs, so compare on normalised
    # whitespace rather than the raw text.
    joined = re.sub(r"\s+", " ", "\n\n".join(chapter["paragraphs"]))
    assert "Find me chapter two, if it isn’t bothering you." in joined
    # …and the passage that used to be its own chapter follows in the same one.
    assert "Chapter two was found, and she glanced at its opening sentences." in joined
    assert "was kissed by him" in joined


def test_rwav_translation_followed_its_chapter_down():
    """The single zh entry was anchored at index 20; after the merge Chapter XX
    is index 19, and the entry must have moved with it."""
    artifact = json.loads(RWAV_ARTIFACT.read_text())
    entries = artifact["translations"]["zh"]["chapters"]

    assert [e["index"] for e in entries] == [19]
    assert artifact["chapters"][19]["title"] == "PART TWO — Chapter XX"
    assert len(entries[0]["paragraphs"]) == len(artifact["chapters"][19]["paragraphs"])


# ── source override ──────────────────────────────────────────────────────────

def test_forced_source_is_none_for_an_unregistered_book():
    assert forced_source(4242) is None


def test_forced_source_is_none_when_the_entry_omits_it(registry):
    registry({"retitle": [{"index": 0, "expect_title": "ACT III", "title": "X"}]})
    assert forced_source(999) is None


def test_forced_source_returns_the_registered_path(registry):
    registry({"source": "text", "why": "illustrated EPUB corrupts the text"})
    assert forced_source(999) == "text"


def test_pride_and_prejudice_is_pinned_to_the_text_split():
    """#1342's stored EPUB is the 1894 illustrated edition: the decorative
    drop-cap is lost so every chapter loses its opening letter, illustration
    captions bleed into chapter titles, and copyright lines become paragraphs."""
    assert forced_source(1342) == "text"
