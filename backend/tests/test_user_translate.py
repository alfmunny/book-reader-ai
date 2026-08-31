

def test_prompt_names_the_languages_and_pins_the_target():
    """It read "Translate from en to zh:" — the target appeared once, as a bare
    code. With a Japanese paragraph under a wrong source code, models answered
    in English (owner, 2026-08-31)."""
    from services.user_translate import _prompt

    p = _prompt("吾輩は猫である。", "ja", "zh")
    assert "Japanese" in p and "Chinese (Simplified)" in p
    assert p.count("Chinese (Simplified)") >= 2, "the target must be unmissable"
    assert "吾輩は猫である。" in p
    assert "from ja to zh" not in p


def test_prompt_falls_back_to_the_code_for_an_unmapped_language():
    from services.user_translate import _prompt

    p = _prompt("text", "en", "eo")
    assert "English" in p and "eo" in p


# ── Batching (owner, 2026-08-31) ─────────────────────────────────────────────

def test_batches_group_consecutive_paragraphs_only():
    """A gap means the paragraphs between were skipped — already translated, or
    edited by hand. Grouping across a gap would hand the model text that is not
    actually adjacent."""
    from services.user_translate import plan_batches
    paras = ["p" * 100 for _ in range(10)]
    assert plan_batches([0, 1, 2, 5, 6], paras) == [[0, 1, 2], [5, 6]]


def test_batches_respect_the_size_and_count_limits():
    from services.user_translate import plan_batches
    # two 800s fit in 1800, three do not
    paras = ["x" * 800 for _ in range(6)]
    assert plan_batches(list(range(6)), paras, max_chars=1800) == [[0, 1], [2, 3], [4, 5]]
    small = ["x" for _ in range(20)]
    assert plan_batches(list(range(20)), small, max_paragraphs=8)[0] == list(range(8))


def test_a_batch_is_split_back_by_its_markers():
    from services.user_translate import parse_batch
    raw = "<<<0>>>\n第一段の訳。\n<<<1>>>\n第二段の訳。"
    assert parse_batch(raw, [0, 1]) == ["第一段の訳。", "第二段の訳。"]


def test_a_misaligned_answer_is_refused_rather_than_guessed():
    """Alignment is not negotiable: paragraph_index is what notes and posts
    anchor to, so a wrong mapping would move a reader's note to another
    paragraph."""
    from services.user_translate import parse_batch
    assert parse_batch("<<<0>>>\nonly one", [0, 1]) is None          # a block missing
    assert parse_batch("<<<0>>>\na\n<<<7>>>\nb", [0, 1]) is None      # wrong numbers
    assert parse_batch("no markers at all", [0]) is None
    assert parse_batch("<<<0>>>\na\n<<<1>>>\n   ", [0, 1]) is None    # empty block


def test_the_batch_prompt_numbers_every_block_and_forbids_merging():
    from services.user_translate import _batch_prompt
    p = _batch_prompt([(0, "一"), (1, "二")], "ja", "zh")
    assert "<<<0>>>" in p and "<<<1>>>" in p
    assert "Do not\nmerge blocks" in p or "Do not merge blocks" in p.replace("\n", " ")
    assert "Chinese (Simplified)" in p


# ── Single paragraph in context ──────────────────────────────────────────────

def test_the_window_is_bounded_and_ordered():
    from services.user_translate import context_window
    paras = [f"p{i}" for i in range(10)]
    before, after = context_window(paras, 5)
    assert before == "p2\n\np3\n\np4"
    assert after == "p6"
    assert context_window(paras, 0)[0] == ""


def test_a_huge_neighbour_cannot_crowd_out_the_target():
    from services.user_translate import context_window, MAX_CONTEXT_CHARS
    paras = ["x" * 9000, "target", "y" * 9000]
    before, after = context_window(paras, 1)
    assert len(before) <= MAX_CONTEXT_CHARS and len(after) <= MAX_CONTEXT_CHARS
