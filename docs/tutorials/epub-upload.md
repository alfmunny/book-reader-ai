# Add your own EPUB

Book Reader AI can read any book you own as an EPUB or plain-text file — not just Gutenberg titles. This tutorial walks through uploading a file, reviewing the detected chapters, and opening the book in the reader.

## Prerequisites

- You are signed in. Uploads require an account (the upload button is hidden for unauthenticated visitors).
- You have a `.epub` or `.txt` file on your device. Both formats are supported.

## 1. Open the upload page

Navigate to `/upload`, or click **Upload** in the navigation (if visible in your plan). You will see a drag-and-drop area with a quota indicator showing how many uploads you have remaining.

## 2. Upload the file

You can upload in two ways:

**Drag and drop:**
1. Drag your `.epub` or `.txt` file from your file manager onto the dashed upload area.
2. Release the file. The upload starts immediately.

**File picker:**
1. Click anywhere inside the dashed upload area.
2. Your OS file picker opens. Select your file.
3. The upload starts immediately.

A spinner appears while the file uploads and the backend parses the chapters. For large EPUBs (500+ pages) this can take a few seconds.

## 3. Audit the chapter split

After the upload completes you land on the chapter audit panel. Auditing a split is a search problem, not a reading problem — you are not reading the whole book, you are finding the places the splitter got it wrong.

The page has two panels: the chapter list on the left, and the full text of the selected chapter on the right.

### Start with the flags

The left rail marks chapters worth looking at:

| Flag | What it usually means |
|---|---|
| **Runt** | Under 400 characters or a single paragraph — often a stray heading that became its own chapter |
| **Oversized** | More than 3× the median chapter — usually two chapters that failed to separate |
| **No title** | The splitter found no heading |
| **Shouting** | An all-caps speaker cue buried in a long paragraph — verse or drama collapsed into one block |

Flags are hints, not verdicts. A flagged chapter can be perfectly correct, and an unflagged one can be wrong.

### Split a merged chapter

Hover between any two paragraphs in the text panel and click **split here**. The chapter divides at that point and the new half starts untitled, so you can name it.

This is the fix for the commonest failure: two chapters run together because the source had no heading between them.

### Merge a chapter that was cut in the middle

Select the chapter that starts mid-scene and click **Merge into previous**.

### Titles

Edit any title directly in the field above the text. For bulk work:

- **Number them** — prefixes `1.`, `2.` and so on, keeping existing names. Any ordinal already there is stripped first, so running it twice is safe.
- **Use first line** — fills only the empty titles from each chapter's opening line.
- **Strip numerals** — removes leading ordinals.

Each is one **Undo** step.

### Discard a chapter

**Discard** removes a chapter entirely. Prefaces, copyright pages and advertisements are the usual candidates.

### Work through it at your own pace

Tick **Mark reviewed** on each chapter as you check it; the panel moves you to the next one. A progress meter shows how far in you are.

**Everything saves as you work.** Close the tab, come back tomorrow, use a different computer — your titles, splits and ticks are all still there. The book appears under **In progress** on your bookshelf with its progress, so you can find your way back.

## 4. Add it to your shelf

When every chapter is ticked, **Add to shelf** becomes available.

This fixes the split permanently, which is what lets your notes stay anchored to the right text, and opens the book in the reader. From here it behaves like any library book: translate chapters, save vocabulary, add annotations.

Uploaded books are **private to you, always**. They never appear in the shared library, and there is no way to publish them.

## Tips

- **Fixing a split later:** open the book from your bookshelf and choose **Review chapter split**. This works until something anchors to the split — once you have annotations or translations on the book, changing chapter boundaries would move them to the wrong text, so the panel refuses and says what would break.
- **Large EPUB files:** files over ~10 MB may take longer to parse. If you see an error on the chapter review page, hit **Retry** — it usually succeeds on the second attempt once the backend has finished processing.
- **Plain-text splits:** `.txt` files without explicit chapter headings are split on blank lines. If the result has too many tiny chapters, re-export the file from your e-reader with chapter headings before uploading.

## Troubleshooting

- **"Only .txt and .epub files are supported"** — rename the file if it has a `.PDF` or `.mobi` extension. Converting other formats (MOBI, AZW3, PDF) to EPUB with Calibre before uploading is the most reliable option.
- **Upload failed** — check your quota (shown on the upload page). If the quota is 0, you have reached your upload limit.
- **No chapters detected** — the EPUB has no table-of-contents entries and the backend could not split it automatically. Try opening the file in Sigil or Calibre and adding a basic NCX/nav table of contents before re-uploading.
- **A chapter is empty** — some EPUBs embed content inside `<image>` or `<svg>` tags with no text. The reader cannot translate image-based pages. Discard those chapters during the audit.
