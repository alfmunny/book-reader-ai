"""Ask a model where an uploaded book's chapters begin.

Why this exists: book_parser matches a fixed list of headings — CHAPTER,
KAPITEL, CHAPITRE, PART, roman numerals, bare numbers, all-caps lines. A book
that marks its chapters any other way collapses into one chapter. Japanese
(第一章, 序章, 第1話), Chinese, Arabic and Hebrew books match nothing at all.

What it does NOT do is split the text. It proposes *where* the boundaries are;
the caller slices deterministically. That distinction is the whole design:

  - The model sees a SKELETON — candidate heading lines and their numbers —
    never the whole book. Cheap, and far less of the reader's private upload
    leaves the server.
  - Its answer is a list of line numbers, validated against the real text.
    Anything out of range, out of order or duplicated is dropped rather than
    trusted.
  - The same skeleton and the same answer always produce the same chapters, so
    a split can be replayed and audited. Nothing is inferred silently: the
    proposal goes to the reader's review screen, which is where uploads are
    confirmed already.
"""

from __future__ import annotations

import json
import logging
import re

logger = logging.getLogger(__name__)

# A heading is short, is not a sentence, and sits alone. This net is
# deliberately wide — it only decides what the model gets to LOOK at, and
# missing a real heading here means it can never be proposed.
_MAX_HEADING_CHARS = 90
_MAX_CANDIDATES = 400
# Short enough to be a bare chapter mark: "1", "１", "IV", "第一章".
_SHORT_HEADING_CHARS = 12
_DIALOGUE_OPENERS = "「『（(\"'\u201c\u201d\u2018\u2019《"
# A contents-page entry is one line under a heading. A real chapter is either
# several lines or one substantial paragraph. Counting characters alone
# misjudges dense scripts, where a full paragraph of Japanese is short.
_MIN_CHAPTER_LINES = 2
_MIN_CHAPTER_CHARS = 40

SYSTEM = """You identify chapter boundaries in books.

You receive numbered candidate lines from a book — headings, titles and short
lines, in reading order. Reply with JSON only:

{"chapters": [{"line": <number>, "title": "<text>"}], "language": "<code>",
 "front_matter_until": <line number or null>, "notes": "<one sentence>"}

Rules:
- "line" must be one of the numbers you were given.
- List every chapter start in order. Do not invent lines.
- "title" is the heading as printed. Keep the original script and numbering.
- "front_matter_until" marks where a contents page, preface or licence ends and
  the work itself begins — null when the book starts immediately.
- If the lines show no chapter structure at all, return an empty list.
"""


def build_skeleton(text: str) -> list[tuple[int, str]]:
    """Lines that could plausibly be headings, as (line number, text).

    Judged on shape — length, indentation, isolation, whether it reads as a
    sentence — never on vocabulary, so no language is favoured.
    """
    lines = text.split("\n")
    out: list[tuple[int, str]] = []
    for i, raw in enumerate(lines):
        line = raw.strip()
        if not line or len(line) > _MAX_HEADING_CHARS:
            continue
        # Prose is indented in many typesettings; headings are not.
        indented = raw[:1] in ("\u3000", "\t", " ")
        # Dialogue opens with a quotation mark in every script that has one.
        if line[0] in _DIALOGUE_OPENERS:
            continue
        if len(line) > 40 and line[-1] in ".!?。！？":
            continue
        alone = i == 0 or not lines[i - 1].strip()
        if alone and not indented:
            out.append((i, line))
            continue
        # A heading need not have a blank line above it. Aozora Bunko marks
        # chapters with a bare numeral directly under a formatting directive
        # (［＃ここから７字下げ］), so requiring one excluded every chapter of a
        # Japanese novel — 71 of them (owner, 2026-08-31).
        if not indented and len(line) <= _SHORT_HEADING_CHARS and not line.endswith("。"):
            out.append((i, line))
    return out[:_MAX_CANDIDATES]


def _valid_boundaries(raw: object, allowed: set[int], total_lines: int) -> list[tuple[int, str]]:
    """Keep only what the text can actually support."""
    if not isinstance(raw, list):
        return []
    seen: set[int] = set()
    kept: list[tuple[int, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        line = item.get("line")
        if not isinstance(line, int) or line in seen:
            continue
        # The model may only choose from the lines it was shown.
        if line not in allowed or line >= total_lines:
            continue
        title = item.get("title")
        title = title.strip() if isinstance(title, str) and title.strip() else f"Chapter {len(kept) + 1}"
        seen.add(line)
        kept.append((line, title[:200]))
    kept.sort(key=lambda p: p[0])
    return kept


def slice_chapters(
    text: str,
    boundaries: list[tuple[int, str]],
    paragraph_mode: str = "blank-line",
    drop: re.Pattern | None = None,
) -> list[dict[str, str]]:
    """Cut the text at the given lines. Pure, and the only thing that splits."""
    if not boundaries:
        return []
    lines = text.split("\n")
    if drop is not None:
        # Typesetting directives are excluded from being headings; they are
        # not part of the prose either, and left in they became paragraphs of
        # their own — ［＃ここで字下げ終わり］ opening a chapter.
        lines = ["" if drop.search(ln.strip()) else ln for ln in lines]
    chapters: list[dict[str, str]] = []

    head = lines[: boundaries[0][0]]
    if len("\n".join(head).strip()) > 200:
        chapters.append({"title": "Front matter", "text": "\n".join(head).strip()})

    for idx, (start, title) in enumerate(boundaries):
        end = boundaries[idx + 1][0] if idx + 1 < len(boundaries) else len(lines)
        body = "\n".join(lines[start + 1 : end]).strip()
        # A heading with almost nothing under it is a contents-page entry, not
        # a chapter — the commonest way an inferred split goes wrong. Fold it
        # into what came before rather than dropping it: a wrong boundary is
        # recoverable in review, lost text is not.
        body_lines = [ln for ln in body.split("\n") if ln.strip()]
        thin = len(body_lines) < _MIN_CHAPTER_LINES and len(body) < _MIN_CHAPTER_CHARS
        if thin and chapters:
            merged = f"{title}\n{body}".strip()
            chapters[-1]["text"] = f"{chapters[-1]['text']}\n\n{merged}".strip()
            continue
        if thin and not chapters:
            chapters.append({"title": "Front matter", "text": f"{title}\n{body}".strip()})
            continue
        chapters.append({"title": title, "text": body})
    if paragraph_mode != "blank-line":
        for c in chapters:
            c["text"] = reflow(c["text"], paragraph_mode)
    return chapters


async def suggest_split(text: str, deepseek_key: str | None = None) -> dict:
    """Propose chapters for `text`. Never raises — an empty list means
    'no proposal', and the caller keeps whatever split it already had."""
    skeleton = build_skeleton(text)
    if len(skeleton) < 2:
        return {"chapters": [], "language": None, "notes": "No candidate headings found."}

    listing = "\n".join(f"{n}: {t}" for n, t in skeleton)

    try:
        raw = await _ask(listing, deepseek_key)
        payload = json.loads(_json_block(raw))
    except Exception:
        logger.exception("split suggestion failed")
        return {"chapters": [], "language": None, "notes": "Could not reach the model."}

    allowed = {n for n, _ in skeleton}
    boundaries = _valid_boundaries(payload.get("chapters"), allowed, len(text.split("\n")))
    chapters = slice_chapters(text, boundaries)
    return {
        "chapters": chapters,
        "language": payload.get("language"),
        "notes": str(payload.get("notes") or "")[:300],
        "candidates_considered": len(skeleton),
    }


# DeepSeek's reasoning model, which thinks before answering. Deciding which of
# forty candidate lines are real chapter starts — and which are a contents page
# — is exactly the kind of question that benefits, and the reader's own key
# pays for it (owner, 2026-08-31).
DEEPSEEK_REASONER = "deepseek-reasoner"


async def _ask(listing: str, deepseek_key: str | None, system: str = SYSTEM) -> str:
    """The reader's DeepSeek key when they have one, else the server's Claude."""
    if deepseek_key:
        import httpx

        from services.deepseek import DEEPSEEK_API_URL

        # Thinking about a few hundred candidate lines takes minutes on a
        # full-length novel — 215s for the owner's 78-chapter book. A 180s
        # timeout cut it off just before the answer arrived.
        async with httpx.AsyncClient(timeout=600.0) as client:
            resp = await client.post(
                DEEPSEEK_API_URL,
                headers={"Authorization": f"Bearer {deepseek_key}"},
                json={
                    "model": DEEPSEEK_REASONER,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": listing},
                    ],
                    # Reasoning tokens come out of this budget. At 8000 the
                    # model spent all of it thinking — 7,999 reasoning tokens,
                    # finish_reason "length", empty content — and answered
                    # nothing (owner, 2026-08-31).
                    "max_tokens": 32000,
                },
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

    from services.claude import get_client

    message = await get_client().messages.create(
        model="claude-sonnet-5",
        max_tokens=4000,
        system=system,
        messages=[{"role": "user", "content": listing}],
    )
    return message.content[0].text


def _json_block(raw: str) -> str:
    """Models fence JSON in markdown often enough to be worth handling."""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.S)
    if fenced:
        return fenced.group(1)
    brace = re.search(r"\{.*\}", raw, re.S)
    return brace.group(0) if brace else "{}"


# ── Rule mode ────────────────────────────────────────────────────────────────
# Sending every candidate line and getting every boundary back costs minutes on
# a long book and scales with its length. Asking instead for a RULE inferred
# from the opening — the shape of a heading in this particular book — costs one
# small request whatever the book's size, and the rule is applied here,
# deterministically, to the whole text (owner, 2026-08-31).
#
# The rule is data, never code. A regex we compile and apply ourselves is a
# plugin in effect without executing anything a model wrote.

SYSTEM_RULE = """You infer how one particular book marks its chapters.

You receive the opening of a book with line numbers — its front matter and its
first few chapters. Work out what a chapter heading looks like IN THIS BOOK and
describe it as a rule. Reply with JSON only:

{"heading_pattern": "<Python regex, matched with fullmatch against each stripped line>",
 "exclude_pattern": "<Python regex or null; a line matching this is never a heading>",
 "require_unindented": <true|false>,
 "paragraph_mode": "blank-line" | "indent" | "every-line",
 "language": "<code>",
 "notes": "<one sentence naming what a heading and a paragraph look like here>"}

Rules:
- heading_pattern must match a heading line completely and match nothing else.
  Prefer a narrow pattern: "[０-９]{1,3}" beats ".{1,10}".
- Typesetting directives, contents entries and headers usually need excluding.
- require_unindented is true when body text is indented and headings are not.
- Do not describe chapter positions. Describe their SHAPE.

paragraph_mode says how THIS book separates paragraphs, so the text can be
reflowed into blank-line-separated paragraphs:
- "blank-line": already separated by an empty line. The usual case.
- "indent": each paragraph begins with an indent (an ideographic space in
  Japanese and Chinese typesetting) and there are no blank lines.
- "every-line": each line is its own paragraph — verse, drama, subtitles.
"""

_MAX_PATTERN_CHARS = 200
_SAMPLE_CHARS = 6000
_PARAGRAPH_MODES = ("blank-line", "indent", "every-line")
_INDENTS = ("\u3000", "\t", "  ")


def reflow(body: str, mode: str) -> str:
    """Put the body into the blank-line-separated form the rest of the app
    assumes.

    The reader and the translator both split paragraphs on a blank line. A
    Japanese chapter marks paragraphs with a leading ideographic space and no
    blank line at all, so thirteen paragraphs arrived as three blocks: an
    unformatted wall of text, and the translation misaligned against it
    (owner, 2026-08-31). Normalising here fixes both, and needs no change on
    either side.
    """
    if mode not in _PARAGRAPH_MODES or mode == "blank-line":
        return body
    lines = [ln for ln in body.split("\n")]
    if mode == "every-line":
        return "\n\n".join(ln.strip() for ln in lines if ln.strip())

    # "indent": a new paragraph starts where a line is indented; anything else
    # continues the one before it.
    paragraphs: list[str] = []
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if raw.startswith(_INDENTS) or not paragraphs:
            paragraphs.append(line)
        else:
            paragraphs[-1] = f"{paragraphs[-1]}{line}"
    return "\n\n".join(paragraphs)


def build_sample(text: str, limit: int = _SAMPLE_CHARS) -> str:
    """The opening, numbered — enough to show front matter and a few chapters."""
    lines = text.split("\n")
    out, used = [], 0
    for i, line in enumerate(lines):
        numbered = f"{i}: {line}"
        out.append(numbered)
        # Count what is actually sent, prefixes included, or the budget is
        # quietly exceeded on a book with many short lines.
        used += len(numbered) + 1
        if used >= limit:
            break
    return "\n".join(out)


def compile_rule(rule: object) -> tuple[re.Pattern | None, re.Pattern | None, bool]:
    """Turn the model's answer into patterns, or nothing if it is unusable."""
    if not isinstance(rule, dict):
        return None, None, False
    raw = rule.get("heading_pattern")
    if not isinstance(raw, str) or not raw or len(raw) > _MAX_PATTERN_CHARS:
        return None, None, False
    try:
        head = re.compile(raw)
    except re.error:
        return None, None, False
    # A pattern that matches nothing at all, or matches emptiness, is useless.
    if head.fullmatch(""):
        return None, None, False

    exc = None
    raw_exc = rule.get("exclude_pattern")
    if isinstance(raw_exc, str) and raw_exc and len(raw_exc) <= _MAX_PATTERN_CHARS:
        try:
            exc = re.compile(raw_exc)
        except re.error:
            exc = None
    return head, exc, bool(rule.get("require_unindented"))


def apply_rule(text: str, rule: object) -> list[tuple[int, str]]:
    """Run the rule over the whole book. Pure, and the only thing that decides
    boundaries — nothing the model wrote is executed."""
    head, exc, unindented_only = compile_rule(rule)
    if head is None:
        return []
    lines = text.split("\n")
    found: list[tuple[int, str]] = []
    for i, raw in enumerate(lines):
        line = raw.strip()
        # Matching only short lines bounds the work a pathological pattern can
        # do, and no heading is long anyway.
        if not line or len(line) > _MAX_HEADING_CHARS:
            continue
        if unindented_only and raw[:1] in ("\u3000", "\t", " "):
            continue
        if exc is not None and exc.search(line):
            continue
        if head.fullmatch(line):
            found.append((i, line))
    # A rule that fires on a large share of the book has matched prose, not
    # headings. Better to offer nothing than to shred the text.
    if len(found) > max(4, len(lines) // 8):
        return []
    return found


def _rule_ran_dry(boundaries: list[tuple[int, str]], total_lines: int) -> int | None:
    """Line where the rule apparently stopped matching, or None.

    A rule inferred from the opening only knows the formats the opening shows.
    When a book changes format midway — full-width numerals １–９ giving way to
    half-width 10, 11 (owner's book, 2026-08-31) — everything after the change
    lands in one giant tail. Detect that: a long stretch after the last
    boundary, out of proportion with the chapters found so far.
    """
    if len(boundaries) < 3:
        return None
    starts = [b[0] for b in boundaries]
    spans = [b - a for a, b in zip(starts, starts[1:])]
    tail = total_lines - starts[-1]
    typical = sorted(spans)[len(spans) // 2]
    if tail > max(4 * typical, total_lines // 4):
        return starts[-1]
    return None


async def _infer_rule(
    sample: str, deepseek_key: str | None, requirements: str | None
) -> dict | None:
    prompt = sample
    if requirements and requirements.strip():
        prompt = f"The reader adds:\n{requirements.strip()[:600]}\n\n{sample}"
    try:
        raw = await _ask(prompt, deepseek_key, system=SYSTEM_RULE)
        return json.loads(_json_block(raw))
    except Exception:
        logger.exception("split rule request failed")
        return None


async def suggest_split_from_rule(
    text: str, deepseek_key: str | None = None, requirements: str | None = None
) -> dict:
    """Infer a rule from the opening, then apply it to the whole book.

    `requirements` is the reader's own instruction — how this book marks a
    paragraph, headings to ignore, anything the opening alone does not show.
    """
    sample = build_sample(text)
    if not sample.strip():
        return {"chapters": [], "rule": None, "notes": "The book appears to be empty."}

    rule = await _infer_rule(sample, deepseek_key, requirements)
    if rule is None:
        return {"chapters": [], "rule": None, "notes": "Could not reach the model."}

    mode = rule.get("paragraph_mode")
    mode = mode if mode in _PARAGRAPH_MODES else "blank-line"
    boundaries = apply_rule(text, rule)

    # Verify, then resample where the rule stopped working. The opening cannot
    # show a format change that happens midway; the point where matches ran dry
    # says exactly where to look next.
    lines = text.split("\n")
    dry_at = _rule_ran_dry(boundaries, len(lines))
    second_rule = None
    if dry_at is not None:
        tail_sample = build_sample("\n".join(lines[dry_at:]))
        note = (
            "This is a LATER section of the same book. The rule inferred from the "
            "opening stopped matching here — the heading format may have changed "
            "(for example full-width numerals becoming half-width). Describe the "
            "heading shape in THIS section."
        )
        extra = f"{note}\n\n{requirements.strip()[:600]}" if requirements and requirements.strip() else note
        second_rule = await _infer_rule(tail_sample, deepseek_key, extra)
        if second_rule is not None:
            # Offset the second rule's matches back into whole-book line numbers.
            tail_bounds = [
                (n + dry_at, t)
                for n, t in apply_rule("\n".join(lines[dry_at:]), second_rule)
            ]
            merged = {n: t for n, t in boundaries}
            for n, t in tail_bounds:
                merged.setdefault(n, t)
            boundaries = sorted(merged.items())
    _, exclude, _ = compile_rule(rule)
    chapters = slice_chapters(text, boundaries, paragraph_mode=mode, drop=exclude)
    combined_pattern = rule.get("heading_pattern")
    if second_rule is not None and second_rule.get("heading_pattern"):
        combined_pattern = f"{combined_pattern} | later: {second_rule['heading_pattern']}"
    return {
        "chapters": chapters,
        "rule": {
            "heading_pattern": combined_pattern,
            "exclude_pattern": rule.get("exclude_pattern"),
            "require_unindented": bool(rule.get("require_unindented")),
            "paragraph_mode": mode,
        },
        "language": rule.get("language"),
        "notes": str(rule.get("notes") or "")[:300],
        "sample_lines": sample.count("\n") + 1,
    }
