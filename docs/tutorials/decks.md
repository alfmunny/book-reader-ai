# Organize vocabulary with decks

Decks let you group saved vocabulary words into named collections — for example, "German verbs", "Chapter 3 words", or "Words I keep forgetting". When you study flashcards, you can filter to a single deck so you only see the cards that matter right now.

## Open the Decks page

Go to **Vocabulary → Decks** (the tab in the top navigation of the vocabulary page), or navigate directly to `/decks`. Your existing decks are listed there with a word count and how many cards are due today.

## Create a deck

1. Click **New deck** (top-right on the Decks page).
2. Enter a **Name** — this is what appears in the deck selector on the Flashcards page.
3. Optionally add a **Description** to remind yourself what this deck is for.
4. Choose a **Mode**: Manual or Smart.
5. Click **Create deck**.

## Manual decks

A Manual deck starts empty. You add and remove words one at a time from inside the deck.

**To add words:**
1. Open the deck (click its card).
2. Click **Add word** (top-right).
3. A picker shows all your saved vocabulary. Click any word to add it immediately.
4. Close the picker when done.

**To remove a word:** find it in the deck's word list and click the trash icon on its row.

## Smart decks

A Smart deck has no member list you manage by hand — membership is computed automatically from your saved vocabulary based on the rules you define. Every time you open the deck, it re-evaluates which words qualify.

Available rules (leave any blank to match everything):

| Rule | Effect |
|---|---|
| **Language** | Only include words saved with this language code (e.g. `de`, `zh`, `ja`). |
| **Tags any of** | Include words tagged with at least one of the listed tags (comma-separated). |
| **Tags all of** | Include only words that carry every listed tag. |
| **Saved after / before** | Date range filter — only words saved within that window. |

Example: a deck with Language `de` and Tags any of `verb, adjective` will always contain every German verb or adjective you save, without any manual curation.

## Filter flashcards by deck

On the **Flashcards** page, the **Deck:** selector (just below the header) lists all your decks. Choose one to study only the cards from that deck. The progress bar and "N of M remaining" counter reflect the filtered set. Your last-used deck is remembered across sessions.

## Delete a deck

Click the trash icon on a deck card. A brief undo toast appears — if you change your mind, tap **Undo** within a few seconds to restore the deck.

Deleting a deck does not delete the vocabulary words inside it — they remain in your vocabulary list.

## Tips

- **Smart + tag workflow**: tag words as you save them (long-press on mobile, right-click on desktop), then create a Smart deck that matches that tag. New words are added automatically.
- **One deck per book chapter**: create a Manual deck per chapter and add words as you encounter them. When you finish the chapter, study that deck for a targeted session.
- **Deck due count**: the number in amber on each deck card is how many cards are due today in that deck — use it to prioritize which deck to study first.
