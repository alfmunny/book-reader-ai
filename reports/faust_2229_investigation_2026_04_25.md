# Faust #2229 — Rendering Investigation & Re-Translation Plan

Date: 2026-04-25
Scope: Book #2229 — *Faust: Der Tragödie erster Teil* by Goethe (German, Gutenberg EPUB)
Prompted by: "Check the titles / splits / stanzas / translation."

## TL;DR

- **Titles**: fixed, pending merge of PR #1055 (EPUB NCX fragment-anchor split).
- **Splits**: 28 canonical scenes correctly produced by the new splitter. Two remaining cosmetic issues (duplicate "Studierzimmer" labels and duplicate "Straße"-like cases) are Gutenberg's choice, not our bug.
- **Stanzas**: preserved correctly — each verse line is its own `\n`-delimited line inside a `\n\n`-delimited paragraph.
- **Translations**: the DB currently holds stale, misaligned translations from a pre-migration run (wrong direction, wrong chapter indices). Re-translation plan ready via `claude-opus-4-7` into English, paragraph-by-paragraph.

## Setup — which code is being checked?

The investigation was run against PR #1055's branch (`feat/epub-ncx-fragment-anchors-964`), which is the splitter code that will go live once that PR merges. The currently-deployed `main` splitter collapses multi-navPoint xhtml files into single chapters, which is the main defect this work is designed to close.

The EPUB used is exactly the one cached in the production DB (`book_epubs.epub_bytes` for `book_id=2229`, 193,049 bytes).

## 1. Titles

### Before #1055 (current `main`)

- Chapter 3 appears as `'FAUST: Der Tragödie erster Teil'` with 17,653 chars.
- The string *looks* like a chapter title but it's the book's part-title page — the navPoint `np-6` in the NCX. The actual scene "Nacht" (Faust's study monologue) gets swallowed into the same chapter because the old spine-only splitter can't segment the single xhtml file at `#pgepubid00005` vs `#pgepubid00006`.

### After #1055

```
 0. 'Zueignung'                           1393 chars
 1. 'Vorspiel auf dem Theater'            8481 chars
 2. 'Prolog im Himmel'                    4730 chars
 3. 'Nacht'                              17646 chars      ← correct
 4. 'Vor dem Tor'                        14093 chars
 5. 'Studierzimmer'                      11857 chars
 6. 'Studierzimmer'                      20909 chars      ← canonical duplicate
 7. 'Auerbachs Keller in Leipzig'        12279 chars
 … 28 chapters total
```

The title "FAUST: Der Tragödie erster Teil" is a structural part-title, not a scene. It's a `<div class="chapter">` with just an `<h2>` inside — 31 chars of body text. After segmentation it falls below the 30-word threshold and is correctly dropped. "Nacht" — the first real scene — becomes chapter 3 as expected.

### Duplicate "Studierzimmer" × 2

Both "Studierzimmer" entries are genuine scenes in Faust — the pact scene and the student scene — and the EPUB's NCX labels them identically (without a disambiguating "(I)" / "(II)"). This is upstream, not a parser defect. Cosmetic fix would be post-processing to append roman numerals on title collisions; out of scope for this investigation.

### Numbered "Straße" scenes

The EPUB already disambiguates these: "Straße (I)" and "Straße (II)". Pass-through.

## 2. Splits

Canonical Faust Teil 1 contains 28 units (3 prologues + 25 scenes). The new splitter output matches:

| # | Title | Chars |
|---|---|---:|
| 0 | Zueignung | 1,393 |
| 1 | Vorspiel auf dem Theater | 8,481 |
| 2 | Prolog im Himmel | 4,730 |
| 3 | Nacht | 17,646 |
| 4 | Vor dem Tor | 14,093 |
| 5 | Studierzimmer | 11,857 |
| 6 | Studierzimmer | 20,909 |
| 7 | Auerbachs Keller in Leipzig | 12,279 |
| 8 | Hexenküche | 12,387 |
| 9 | Straße (I) | 2,948 |
| 10 | Abend. | 5,045 |
| 11 | Spaziergang | 2,482 |
| 12 | Der Nachbarin Haus | 7,286 |
| 13 | Straße (II) | 2,110 |
| 14 | Garten | 6,390 |
| 15 | Ein Gartenhäuschen | 916 |
| 16 | Wald und Höhle | 6,324 |
| 17 | Gretchens Stube | 792 |
| 18 | Marthens Garten | 5,112 |
| 19 | Am Brunnen | 1,744 |
| 20 | Zwinger | 957 |
| 21 | Nacht. Straße vor Gretchens Türe | 5,915 |
| 22 | Dom | 1,545 |
| 23 | Walpurgisnacht | 15,915 |
| 24 | Walpurgisnachtstraum | 5,912 |
| 25 | Trüber Tag. Feld | 3,238 |
| 26 | Nacht, offen Feld | 323 |
| 27 | Kerker | 7,885 |

Short-scene sanity check:

- **#17 Gretchens Stube (792 chars)** — *Meine Ruh ist hin* lied; genuinely short. Pass.
- **#20 Zwinger (957 chars)** — *Ach neige, du Schmerzenreiche* prayer; genuinely short. Pass.
- **#26 Nacht, offen Feld (323 chars)** — just three stage-direction paragraphs and Mephisto's "Sie ist gerichtet." over a black horse. Genuinely that short in the original text. Pass.

## 3. Stanzas

Spot-check on scene 3 "Nacht", first verse (Faust's opening monologue):

```
FAUST.
Habe nun, ach! Philosophie,
Juristerei und Medizin,
Und leider auch Theologie
Durchaus studiert, mit heißem Bemühn.
Da steh ich nun, ich armer Tor!
Und bin so klug als wie zuvor;
…
```

- Speaker cue (`FAUST.`) on its own line — correct.
- Each verse line on its own line (internal `\n`) — correct.
- Blank-line between stanzas (`\n\n`) — correct.
- Stage directions in parentheses like `(Er schlägt das Buch auf und erblickt das Zeichen des Makrokosmus.)` stay on the line that closes a stanza — preserved.

The `<br>` inside `<p>` handling (#820 regression series) is doing its job end-to-end for Faust. No stanza flattening, no speaker cue collapse.

## 4. Translation state

### Current DB rows for `book_id=2229`

| target | rows | model | notes |
|---|---:|---|---|
| `de` | 27 | `Helsinki-NLP/opus-mt-en-de` | wrong direction (en→de, source is German) |
| `fr` | 27 | `Helsinki-NLP/opus-mt-en-fr` | wrong direction (en→fr, source is German) |
| `zh` | 1 | *(null)* | orphan, single chapter |
| `en` | 0 | — | **missing** |

The rows under `de`/`fr` came from an early pre-seed run that used an English-source Helsinki-NLP model against a German EPUB — effectively garbage. They're also keyed to the **old 27-chapter** structure, so after the new splitter lands and re-splits into 28 chapters, the existing indices misalign by one starting at scene "Nacht" (former index 3 becomes meaningless).

This is the cache-misalignment incident the user referred to ("I lost the translation when you did a migration before"). Correct fix: drop the stale rows and re-translate fresh against the post-#1055 chapter structure.

### Re-translation plan

Script written and staged at `/tmp/translate_faust.py`:

- Uses the new splitter directly (no dependency on which build is deployed).
- Calls `claude-opus-4-7` via `anthropic.AsyncAnthropic` — the literary-translation SYSTEM prompt from `backend/services/claude.py` extended with explicit rules for preserving speaker cues, line structure, and stanza breaks.
- Paragraph-aware chunking at ~4 KB per chunk — keeps each API call small enough to reason about structure without chunking mid-verse.
- Per-chunk retry on paragraph-count mismatch (expected-vs-returned). Three attempts, then a warning is logged and output paragraphs are inserted verbatim (best-effort) so one uncooperative chunk doesn't sink the whole chapter.
- Writes into `translations` via `INSERT OR REPLACE` with `target_language='en'`, `provider='anthropic'`, `model='claude-opus-4-7'`.
- No deletion of existing `de` / `fr` / `zh` rows — can be done explicitly later if the user wants to purge.

Total estimated work: 28 chapters × ~100 paragraphs average = ~2,800 API calls at current chunking, or ~50-60 grouped chunks at 4 KB each. Wall-time ~10–20 minutes at current rate limits. Cost is on the user's Anthropic key — the script does not parallelize aggressively to stay well under the per-minute cap.

## Remaining items

1. **Run the translation script**. Blocked on explicit go-ahead since it consumes paid API tokens.
2. **Optional cleanup** — delete the stale `de`/`fr`/`zh` rows once English is in place (or instead leave them as historical noise — the frontend will just prefer whichever language the reader asks for).
3. **Post-#1055 merge check**: when the PR merges and the production deploy picks up the new parser, the reader's chapter_index will match the translation rows' chapter_index automatically. No further migration needed on the client side.

## References

- NCX anchor splitter: PR #1055 (feat/epub-ncx-fragment-anchors-964)
- Design doc: `docs/design/epub-ncx-fragment-anchors.md` (merged #968)
- Existing Claude translator: `backend/services/claude.py` — `translate_text` + `translate_chunk`
- Translation script (one-off): `/tmp/translate_faust.py`
- Prior cache-misalignment incident: #780 / #783
