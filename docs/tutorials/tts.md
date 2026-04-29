# Listen to your book with text-to-speech

Book Reader AI can read any chapter aloud using AI-generated speech. No API key is required — the feature works out of the box using a free text-to-speech engine, with higher-quality audio available when you have a Gemini key.

## Start listening

Open any chapter. At the bottom of the reader you'll see the audio bar with a **Read** button. Click it to start playback. The button changes to **Pause** while audio is playing — click it again to pause.

Press **Space** anywhere in the reader to toggle play/pause without reaching for the mouse.

## Controls

The audio bar contains everything you need:

| Control | What it does |
|---|---|
| **Read / Pause** | Start or pause chapter audio |
| **F / M** | Toggle between Female and Male voice |
| **Seek bar** | Scrub to any point in the chapter — drag the slider or click a position |
| **Speed slider** | Change playback speed from 0.5× (slow) to 2× (fast) |

The seek bar only appears once audio has finished loading. The current time and total duration are shown on either side.

## Resume where you left off

Your playback position is saved automatically. If you navigate away and return to the chapter, clicking **Read** picks up from where you paused — even after closing the browser.

## Read a single paragraph

If you have **Paragraph focus** enabled (via Typography settings or Focus mode), a **Read para** button appears next to the chapter navigation bar. Click it to play just the focused paragraph without starting the full chapter audio.

The paragraph reader uses the same voice and quality settings as the full chapter player.

## Read a highlighted sentence

Click any sentence in the reader to open the sentence toolbar. Click the **Read** (speaker) button in the toolbar to play just that sentence. If the chapter was already playing, it pauses during the sentence and resumes automatically when it finishes.

## Voice quality

| Situation | Engine used |
|---|---|
| No Gemini key | Microsoft Edge TTS (free, no account needed) |
| Gemini key saved | Google Gemini TTS (higher quality, natural intonation) |

To add your Gemini key for better quality, go to **Profile → Gemini API Key**. See [Enable AI translation](ai-translation.md) for key setup steps.

## Tips

- **Speed up non-fiction, slow down poetry.** Drag the speed slider to 1.5× for informational chapters; drop to 0.75× for verse or dense passages.
- **Switch chapters without losing the thread.** Audio stops on chapter change; press **Read** again on the new chapter to continue listening.
- **Use the seek bar to re-listen.** If a passage went by too fast, drag the seek handle backward to replay it.
- **Mix reading and listening.** Click a sentence to open its toolbar and get a translation or note while audio is paused — the position is preserved.
