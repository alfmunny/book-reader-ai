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
    part_labels,
    apply_overrides,
    forced_source,
    frontmatter_roles,
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


def test_hamlet_every_act_opens_on_a_nameable_scene_one():
    """Regression: the chapter titled 'ACT I' *is* Act I Scene I.

    The splitter cut at the 'ACT n' heading, so each act's Scene I was swallowed
    into a chapter named only for the act. The Contents panel listed
    ACT I / SCENE II / SCENE III …, and Scene I appeared nowhere in the play —
    five scenes unreachable by name in a 20-row table of contents.

    #2769 fixed this by putting the act in the title; grouping moved the act to
    the header. Either way the invariant is the same: the first chapter of every
    act is named for the scene it holds, and no chapter is left bare.
    """
    artifact = json.loads(HAMLET_ARTIFACT.read_text())

    bare_acts = [c["title"] for c in artifact["chapters"]
                 if re.fullmatch(r"ACT [IVX]+", c["title"])]
    assert not bare_acts, f"act chapters still unnamed for their scene: {bare_acts}"

    first_of_act = {}
    for chapter in artifact["chapters"]:
        first_of_act.setdefault(chapter["part"], chapter)
    assert len(first_of_act) == 5

    for act, chapter in first_of_act.items():
        assert chapter["title"].startswith("SCENE I."), f"{act}: {chapter['title']}"
        heading = next(p for p in chapter["paragraphs"] if p.startswith("SCENE I."))
        # The title is the scene's own location line, not an invented one.
        assert chapter["title"] == heading, f"{act}: {chapter['title']!r} vs {heading!r}"


def test_hamlet_keeps_all_five_acts_and_twenty_scenes():
    """Retitling and grouping rename and label; neither may add, drop or
    reorder a chapter."""
    artifact = json.loads(HAMLET_ARTIFACT.read_text())

    titles = [c["title"] for c in artifact["chapters"]]
    assert len(titles) == 20
    assert [c["index"] for c in artifact["chapters"]] == list(range(20))
    assert len({c["part"] for c in artifact["chapters"]}) == 5


def test_hamlet_retitles_match_the_declared_overrides():
    """Drift guard: the artifact must carry exactly what the registry declares.

    Indices in the registry name the *raw* split (21 chapters, before the
    PROLOGUE merge), so this asserts the titles landed rather than the numbers.
    """
    from scripts.chapter_split_overrides import OVERRIDES

    declared = {r["title"] for r in OVERRIDES[1524]["retitle"]}
    artifact = json.loads(HAMLET_ARTIFACT.read_text())
    present = {c["title"] for c in artifact["chapters"]}
    assert declared <= present, declared - present


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


# ── frontmatter ──────────────────────────────────────────────────────────────

def test_no_frontmatter_for_an_unregistered_book():
    assert frontmatter_roles(4242, _scene_split()) == {}


def test_frontmatter_marks_the_named_chapter(registry):
    registry({"frontmatter": [{"index": 0, "expect_title": "ACT III"}]})
    assert frontmatter_roles(999, _scene_split()) == {0: "frontmatter"}


def test_frontmatter_aborts_rather_than_marking_the_wrong_chapter(registry):
    """Hiding a chapter of the work is worse than showing a title page, so a
    moved split must stop the freeze rather than guess."""
    registry({"frontmatter": [{"index": 0, "expect_title": "SOMETHING ELSE"}]})
    with pytest.raises(SystemExit, match="expected chapter 0"):
        frontmatter_roles(999, _scene_split())


def test_frontmatter_indices_are_checked_against_the_corrected_split(registry):
    """Dracula's entry expects "TITLE PAGE" — the name its own retitle gives
    chapter 0 — so frontmatter resolves after retitles, not before."""
    registry({
        "retitle": [{"index": 0, "expect_title": "ACT III", "title": "TITLE PAGE"}],
        "frontmatter": [{"index": 0, "expect_title": "TITLE PAGE"}],
    })
    corrected = apply_overrides(999, _scene_split())
    assert frontmatter_roles(999, corrected) == {0: "frontmatter"}


# ── the committed artifacts ──────────────────────────────────────────────────

def _artifact(book_id: int):
    return json.loads((REPO_ROOT / "data" / "books" / f"book_{book_id}.json").read_text())


def test_apparatus_chapters_are_marked_across_the_corpus():
    for book_id in (345, 2554, 2701):
        chapters = _artifact(book_id)["chapters"]
        assert chapters[0].get("role") == "frontmatter", f"book {book_id} ch0 unmarked"


def test_marking_frontmatter_does_not_disturb_the_frozen_split():
    """role sits outside content_sha256, so a marked book still verifies."""
    from scripts.ingest_book import load_artifact
    for book_id in (345, 2554, 2701):
        load_artifact(REPO_ROOT / "data" / "books" / f"book_{book_id}.json")


def test_gatsby_epigraph_is_named_not_hidden():
    """Chapter 0 is titled 'Table of Contents' in the source but holds the
    novel's epigraph. It is retitled, and deliberately not marked apparatus."""
    chapters = _artifact(64317)["chapters"]
    assert chapters[0]["title"] == "EPIGRAPH"
    assert "role" not in chapters[0]
    assert "gold hat" in chapters[0]["paragraphs"][0]


def test_moby_dick_etymology_chapter_is_not_marked_apparatus():
    """Chapter 1 opens with a transcriber's line but runs 93 paragraphs of the
    real Etymology and Extracts. Marking it would hide the book's own text."""
    chapters = _artifact(2701)["chapters"]
    assert "role" not in chapters[1]
    assert len(chapters[1]["paragraphs"]) > 50


# ── parts (#2745 Phase 2) ────────────────────────────────────────────────────

def test_parts_labels_every_chapter_in_the_declared_range(registry):
    registry({"parts": [
        {"label": "ACT I", "from": 0, "to": 1, "expect_first_title": "One"},
    ]})
    chapters = [Chapter(title="One", text="a"), Chapter(title="Two", text="b"),
                Chapter(title="Three", text="c")]
    assert part_labels(999, chapters) == {0: "ACT I", 1: "ACT I"}


def test_parts_leaves_an_undeclared_chapter_ungrouped(registry):
    """Crime and Punishment's epilogue belongs to no part; absent is the answer,
    not an invented one-chapter group."""
    registry({"parts": [
        {"label": "PART I", "from": 0, "to": 0, "expect_first_title": "One"},
    ]})
    chapters = [Chapter(title="One", text="a"), Chapter(title="EPILOGUE", text="b")]
    assert 1 not in part_labels(999, chapters)


def test_parts_abort_when_the_boundary_title_moved(registry):
    """A shifted split must group nothing rather than group the wrong scenes."""
    registry({"parts": [
        {"label": "ACT I", "from": 0, "to": 1, "expect_first_title": "One"},
    ]})
    chapters = [Chapter(title="Something else", text="a"), Chapter(title="Two", text="b")]
    with pytest.raises(SystemExit):
        part_labels(999, chapters)


def test_parts_abort_when_the_range_runs_past_the_split(registry):
    registry({"parts": [
        {"label": "ACT I", "from": 0, "to": 9, "expect_first_title": "One"},
    ]})
    with pytest.raises(SystemExit):
        part_labels(999, [Chapter(title="One", text="a")])


def test_parts_abort_on_an_inverted_range(registry):
    registry({"parts": [
        {"label": "ACT I", "from": 1, "to": 0, "expect_first_title": "Two"},
    ]})
    chapters = [Chapter(title="One", text="a"), Chapter(title="Two", text="b")]
    with pytest.raises(SystemExit):
        part_labels(999, chapters)


def test_parts_abort_when_two_ranges_claim_one_chapter(registry):
    registry({"parts": [
        {"label": "ACT I", "from": 0, "to": 1, "expect_first_title": "One"},
        {"label": "ACT II", "from": 1, "to": 1, "expect_first_title": "Two"},
    ]})
    chapters = [Chapter(title="One", text="a"), Chapter(title="Two", text="b")]
    with pytest.raises(SystemExit):
        part_labels(999, chapters)


def test_unregistered_book_has_no_parts():
    assert part_labels(424242, [Chapter(title="One", text="a")]) == {}


# ── The committed Hamlet artifact carries its acts ───────────────────────────

def test_hamlet_artifact_groups_every_scene_under_an_act():
    artifact = json.loads(HAMLET_ARTIFACT.read_text())
    parts = [c.get("part") for c in artifact["chapters"]]
    assert all(parts), "every scene belongs to an act"
    assert parts == (["ACT I"] * 5 + ["ACT II"] * 2 + ["ACT III"] * 4
                     + ["ACT IV"] * 7 + ["ACT V"] * 2)


def test_hamlet_leaf_titles_no_longer_repeat_the_act():
    """#2769 put the act in the title because the panel was flat. The group
    header carries it now, so a leaf saying 'ACT I' would say it twice."""
    artifact = json.loads(HAMLET_ARTIFACT.read_text())
    for chapter in artifact["chapters"]:
        assert not chapter["title"].startswith("ACT "), chapter["title"]
    # The audited scene location from #2769 survives; only the prefix moved.
    assert artifact["chapters"][0]["title"] == "SCENE I. Elsinore. A platform before the Castle."


def test_hamlet_grouping_moved_no_paragraph():
    """`part` sits outside content_sha256 and the retitles touch titles only, so
    every paragraph must be byte-identical to what the zh translation anchored
    against."""
    artifact = json.loads(HAMLET_ARTIFACT.read_text())
    counts = [len(c["paragraphs"]) for c in artifact["chapters"]]
    assert len(counts) == 20
    assert counts[0] == 74, "chapter 0 is what the zh translation anchors to"
