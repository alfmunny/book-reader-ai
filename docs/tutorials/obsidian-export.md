# Export vocabulary to Obsidian

Book Reader AI can push the vocabulary words you save while reading directly into your Obsidian vault as Markdown notes. Each book gets its own note file containing every word you saved, grouped with its definition.

## Prerequisites

- You have an Obsidian vault synced to a GitHub repository (Obsidian Sync, Self-hosted Git, or any repo-backed setup works).
- You have a GitHub personal access token (PAT) with `contents:write` on that repo.
- You have saved at least one vocabulary word while reading.

### Create a GitHub PAT

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. Click **Generate new token**. Give it a name like "Book Reader AI – Obsidian export".
3. Under **Repository access**, select your Obsidian vault repo.
4. Under **Permissions → Repository permissions → Contents**, choose **Read and write**.
5. Click **Generate token** and copy it. You will not see it again.

## 1. Configure Obsidian settings in your profile

1. Open **Profile** (top-right avatar → Profile, or navigate to `/profile`).
2. Scroll to the **Obsidian Export** section and expand it.
3. Paste your GitHub PAT into **GitHub Token**.
4. Set **Obsidian Repo** to your vault repo in `username/repo-name` format, e.g. `alice/my-obsidian-vault`.
5. Set **Vault Path** to the folder inside the repo where book notes should land, e.g. `All Notes/002 Literature Notes/000 Books`. The default works well for most setups.
6. Click **Save Obsidian settings**. A green confirmation message appears when the settings are stored.

## 2. Save vocabulary words while reading

Every word you tap (or click) and save in the reader is eligible for export.

1. Open any book in the reader.
2. Tap a word you want to save. The word lookup panel appears.
3. Click **Save** to add the word to your vocabulary list.

Repeat for as many words as you like across any number of chapters. Saved words persist across sessions.

## 3. Export to Obsidian

You can trigger the export from two places:

**From the reader:**
1. While reading any chapter, look for the **Obsidian** button in the reader's right toolbar (desktop only, appears as an icon with the label "Obsidian").
2. Click it. The export runs and a toast notification shows the URL of the created note in GitHub.
3. Click the URL link in the toast to open the file in GitHub and verify it landed correctly.

**From the Vocabulary page:**
1. Go to **Vocabulary** (nav → Vocabulary, or `/vocabulary`).
2. Click **Export all to Obsidian** in the top-right of the header.
3. The same toast appears with the GitHub file URL.

The export creates or updates a Markdown file at `<vault-path>/<book-title>.md` in your repo. Obsidian picks up the change on next sync.

## What the note looks like

Each exported note contains a YAML frontmatter block with the book title and export date, followed by a vocabulary table:

```markdown
---
title: "Faust"
exported: 2026-04-28
---

# Vocabulary — Faust

| Word | Language | Occurrences |
|---|---|---|
| Geist | de | 3 |
| streben | de | 2 |
| Erdgeist | de | 1 |
```

## Troubleshooting

- **"Obsidian settings not configured"** — go to Profile → Obsidian Export and make sure both GitHub Token and Obsidian Repo are saved. The token field shows "Token configured" in green when a token is stored.
- **"Export failed: 401"** — your GitHub token is expired or doesn't have `contents:write`. Generate a new one and update it in Profile.
- **"Export failed: 404"** — the repo name in the Obsidian Repo field is wrong. Check the `username/repo-name` format matches your GitHub URL exactly.
- **No words in the note** — you haven't saved any vocabulary words for that book yet. Save words from the word lookup panel while reading, then export again.
- **File appears but Obsidian doesn't update** — trigger a sync in Obsidian (for Git plugin: open the command palette → Git: Sync). Obsidian doesn't hot-reload files changed externally.
