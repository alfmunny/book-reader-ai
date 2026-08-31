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


def slice_chapters(text: str, boundaries: list[tuple[int, str]]) -> list[dict[str, str]]:
    """Cut the text at the given lines. Pure, and the only thing that splits."""
    if not boundaries:
        return []
    lines = text.split("\n")
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


async def _ask(listing: str, deepseek_key: str | None) -> str:
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
                        {"role": "system", "content": SYSTEM},
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
        system=SYSTEM,
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
