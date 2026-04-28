# Review vocabulary with flashcards

Book Reader AI includes a spaced-repetition (SRS) flashcard system built around the words you save while reading. Words you save get added to a review queue; the system schedules them so you see each word again just before you're likely to forget it.

## Prerequisites

- You are signed in.
- You have saved at least one vocabulary word while reading (see step 1 below).

## 1. Save words while reading

Flashcards are created automatically from the words you save in the reader.

1. Open any book chapter in the reader.
2. Tap (mobile) or click (desktop) a word you want to learn.
3. The word lookup panel appears with the word's definition.
4. Click **Save** to add the word to your vocabulary.

Repeat for any word you encounter. Saved words appear in your **Vocabulary** list and are automatically scheduled for flashcard review.

## 2. Open the flashcard review session

1. Go to **Vocabulary** (nav → Vocabulary, or `/vocabulary`).
2. Click the **Flashcards** button in the top-right of the header.

You are taken to the Flashcard review page. The header shows how many cards are due today and your current streak.

### Optional: filter by deck

If you have created vocabulary decks (via Vocabulary → Decks), you can select a specific deck from the dropdown at the top of the flashcard page to review only words from that deck. Leave it on **All decks** to review everything due today.

## 3. Review your cards

Each card shows a word on the front. The back contains the definition and example sentences from your reading context.

1. Read the word on the front.
2. Try to recall the definition before flipping.
3. Click or tap the card (or press **Space**) to flip it and see the definition.
4. Rate how well you remembered it by clicking one of four buttons:

| Button | Keyboard | When to use |
|---|---|---|
| **Again** | `1` | You had no idea or got it completely wrong |
| **Hard** | `2` | You remembered, but it took a lot of effort |
| **Good** | `3` | You remembered with some effort — the normal choice |
| **Easy** | `4` | Instantly recalled, no hesitation |

The system (SM-2 algorithm) uses your rating to schedule the next review. Words rated **Again** come back very soon; words rated **Easy** are pushed weeks into the future.

## 4. Finish the session

When all due cards have been reviewed, a completion screen shows your session stats: cards reviewed, accuracy, and streak.

Click **Done** to return to your Vocabulary list, or **Review again** to run through all the cards from scratch.

## Tips

- **Daily habit beats marathon sessions.** The SRS algorithm is calibrated for short daily sessions (~10–20 cards). Reviewing 5 cards today is more effective than reviewing 50 cards once a week.
- **Context helps retention.** Words are shown with the sentence and chapter they came from. Use that context — don't just memorize the definition in isolation.
- **Add hard words sooner.** If you're reading and a word looks important, save it even before you look it up. The sooner it enters the queue, the more review repetitions it accumulates.
- **Decks for targeted study.** Create a deck for a single book or language and filter the flashcard session to that deck if you want to focus.

## Troubleshooting

- **"No cards due"** — either you haven't saved any words yet (see step 1), or today's review has already been completed. Check the **Next review** date on the Vocabulary page — it shows when your next batch is due.
- **A card keeps coming back immediately** — you rated it **Again**. This is normal; the system will keep showing it until you rate it at least **Hard**. Try reading the example sentence closely to reinforce the meaning.
- **Words from deleted books still appear** — vocabulary words are stored independently of books. You can delete them individually from the Vocabulary list (tap the word, then click **Delete**).
