# Review and publish a book to the library

Books do not appear in the library the moment they are imported. A session audits the chapter split and freezes it; then a person reads it and decides whether it belongs in front of readers. This tutorial covers that second half — the review queue, fixing a bad split, and adding a book to the library.

## Prerequisites

- Admin access (the first user on a fresh database is automatically admin).
- At least one book that a session has already audited and frozen.

## Two decisions, not one

It helps to know why this is split in two, because the wording follows from it.

**Freezing** is technical: the chapter split is fixed, so annotations, translations and vocabulary can anchor to stable chapter numbers. It is what stops the splitter quietly producing different chapters after a deploy. A session does this on its own.

**Adding to the library** is editorial: this book is good enough for readers. It is outward-facing, and it is reversible — removing a book hides it without touching the freeze, so nothing that anchors to the split breaks.

A frozen book that nobody has added to the library is invisible to readers. That is why a session can freeze freely: nothing is exposed until you say so.

## 1. Open the review queue

Go to **Admin → Books**. The **Awaiting review** panel sits at the top, listing every frozen book that is not yet in the library.

Each row shows what you need in order to decide:

| Shown | Why it matters |
|---|---|
| Chapter count | A wildly wrong number is the first sign of a bad split |
| Frozen date and auditor | Who audited it, and when |
| Translation progress | `zh 11/42`, `zh complete`, or `not translated` |

Translation progress is shown, not enforced. A part-translated book can still be added to the library — publishing an untranslated original is a legitimate thing to do — but you should be making that choice knowingly rather than by accident.

## 2. Check the book

**Read it first** opens the book in the reader, exactly as a reader would see it. This is the fastest way to catch a split that is wrong in a way the chapter count does not reveal — a chapter that starts mid-sentence, or two scenes run together.

## 3. Fix a bad split

**Review split** opens the chapter audit panel on the frozen chapters.

- Flags in the left rail mark chapters worth a look: very short, more than three times the median length, or missing a title.
- Hover between two paragraphs and click **split here** to cut a merged chapter apart.
- **Merge into previous** joins a chapter that was cut in the middle.
- The title tools number chapters, fill empty titles from the first line, or strip leading numerals.

Editing rewrites the frozen chapters and re-stamps the content hash, so what you approved is what is stored. It does not add the book to the library — that stays a separate step.

### When editing is refused

If anything already anchors to the split, the panel refuses and says what would break:

> *3 annotations, 41 translations anchor to this split — changing it would move them to the wrong chapters*

This is the point of freezing. Changing chapter boundaries under existing notes would silently move every one of them to the wrong text. A book in the review queue has no annotations — nobody can read it before it is in the library — so this only appears for a book that is already published.

To change a published book's split you must first remove it from the library, delete whatever anchors to it, and re-audit. That is deliberately awkward.

## 4. Add it to the library

**Add to library** publishes the book. It appears on the home page immediately and the row leaves the queue.

From inside the split reviewer, the same button saves your edits and adds the book in one step.

## 5. Take a book back out

Every published book in the main list carries **Remove from library**. The book disappears from the home page; the freeze, the chapters, and every reader's notes are untouched. Add it again whenever you like.

Use this when you publish something and then notice a problem — it is the safe half of the pair.

## What you will never see here

**Books that readers uploaded themselves.** An uploaded book is private to its owner permanently. It gets frozen when its owner finishes auditing it, but it can never reach the library or this queue. The two flows only share the audit panel; nothing else connects them.

## Row badges in the main list

| Badge | Meaning |
|---|---|
| *not audited* | No frozen split yet — it cannot be added to the library |
| *awaiting review* | Frozen, waiting for you |
| (no badge) | Already in the library |

## See also

- **[Add your own EPUB](epub-upload.md)** — the reader-facing half of the audit panel.
- **[Set up the reading queue](queue.md)** — background pre-translation, which feeds the translation progress shown here.
