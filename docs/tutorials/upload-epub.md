# Upload your own EPUB

You have a book as an `.epub` or `.txt` file and you want to read it — with AI translation, annotations, and vocabulary — in Book Reader AI. This tutorial walks you through from file to first sentence.

## Prerequisites

- A Book Reader AI account (sign in via the home page).
- Your book file: `.epub` (up to 15 MB) or plain text `.txt` (up to 3 MB).

## 1. Open the Upload tab

1. Sign in and go to the home page (`http://localhost:3000`).
2. Click **Upload** in the tab bar at the top of the page.

> The Upload tab is only visible when you're signed in. If you don't see it, click **Sign in** and try again.

## 2. Upload your file

On the Upload page you'll see a dashed drop zone and a quota bar showing how many books you've uploaded.

**Option A — drag & drop:** Drag your `.epub` or `.txt` file from your file manager and drop it anywhere inside the dashed rectangle.

**Option B — file picker:** Click anywhere inside the drop zone. A system file picker opens. Select your file and click Open.

The drop zone switches to a spinner labelled "Uploading and parsing…". For a typical novel-length EPUB this takes 2–10 seconds.

## 3. Review the chapter list

After parsing, you land on the **Review Chapters** page. The app has split your book into chapters and lists them on the left.

- **Rename a chapter title**: click the title field and type. The change only affects how the chapter is labelled inside the app — it does not modify your file.
- **Remove a chapter**: click the trash icon next to it. Use this to drop front-matter, licence pages, or appendices you don't want to read.
- **Preview a chapter**: click a chapter row to see a short excerpt on the right.

When you're happy with the list, click **Confirm and start reading**. The app saves the chapter structure.

## 4. Read

You land in the reader, already open on chapter 1. Everything works the same as a Gutenberg book:

- **Translate**: click **Translate** in the sidebar to generate a side-by-side translation.
- **Save vocabulary**: double-click any word.
- **Annotate**: select a sentence and click **Annotate**.

## Quota and limits

Each account has a per-upload quota (shown on the Upload page). If the quota bar is full, delete an existing uploaded book from the Library page to free a slot.

## What's next

- **[Enable AI translation](ai-translation.md)** — add your API key so the Translate button works.
- **[Read your first Gutenberg book](first-book.md)** — discover the full reading experience with a freely available classic.
