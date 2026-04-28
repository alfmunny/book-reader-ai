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

## 3. Review the detected chapters

After the upload completes, you are taken to the **Review Chapters** page. The backend has parsed the EPUB's table of contents (or split the text file into chapters) and shows you every chapter it found.

The page has two panels:

| Panel | What it shows |
|---|---|
| Left — chapter list | Every detected chapter with its title and word count |
| Right — preview | The first few hundred words of the selected chapter |

### Edit chapter titles

Click any chapter in the left list to select it. The title is editable — click the title field and type a new name if the detected title is wrong or missing.

### Remove chapters

Click the **trash icon** next to any chapter you want to exclude. Prefaces, tables of contents, copyright pages, and advertisements are common candidates for removal. Removed chapters do not appear in the reader.

### Preview before confirming

Select each chapter to read the preview and confirm the split looks correct. If chapter 1 starts mid-sentence, the EPUB's table-of-contents metadata may be missing; you may need to remove the partial-content chapters manually.

## 4. Confirm and open the reader

When the chapter list looks right, click **Confirm** (top-right of the page).

The backend saves your chapter selection and opens the reader at Chapter 1 of your book. From here, the book works exactly like a Gutenberg title: you can translate chapters, look up vocabulary, add annotations, and queue it for background translation.

## Tips

- **Re-upload to reset:** if you confirmed a bad split, go back to `/upload` and upload the same file again. The old draft is replaced by the new one.
- **Large EPUB files:** files over ~10 MB may take longer to parse. If you see an error on the chapter review page, hit **Retry** — it usually succeeds on the second attempt once the backend has finished processing.
- **Plain-text splits:** `.txt` files without explicit chapter headings are split on blank lines. If the result has too many tiny chapters, re-export the file from your e-reader with chapter headings before uploading.

## Troubleshooting

- **"Only .txt and .epub files are supported"** — rename the file if it has a `.PDF` or `.mobi` extension. Converting other formats (MOBI, AZW3, PDF) to EPUB with Calibre before uploading is the most reliable option.
- **Upload failed** — check your quota (shown on the upload page). If the quota is 0, you have reached your upload limit.
- **No chapters detected** — the EPUB has no table-of-contents entries and the backend could not split it automatically. Try opening the file in Sigil or Calibre and adding a basic NCX/nav table of contents before re-uploading.
- **Chapter preview is empty** — some EPUBs embed content inside `<image>` or `<svg>` tags with no text. The reader cannot translate image-based pages.
