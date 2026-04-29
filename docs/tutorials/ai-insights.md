# Ask questions with AI Insights

The Insights sidebar is a reading-side AI chat that knows what chapter you're on. Open it while reading to get an auto-generated interpretation of the chapter, then ask follow-up questions — plot analysis, vocabulary, historical context, literary themes — all in the language of your choice.

## Requirements

Insights and chat require a **Gemini API key**. Without one, you can read the prompts and history but cannot send messages or generate new insights. Add your key at **Profile → Gemini API Key**. The Gemini free tier (1 M tokens/day) is enough for a full reading session. See [Enable AI translation](ai-translation.md) for key setup steps.

## Open the Insights sidebar

Click the **chat bubble icon** in the reader's right toolbar to open the Insights panel. The panel is the default tab; the sidebar also has tabs for Translation, Summary, Notes, and Vocabulary.

When you open a new chapter, the sidebar automatically generates a short insight — a paragraph-long commentary, observation, or thematic note about the chapter text. This happens once per chapter; switching chapters generates a new insight for that chapter.

## Ask a follow-up question

Type any question in the text box at the bottom of the panel. Press **Enter** to send (Shift+Enter for a newline). Examples:

- "What does this passage say about the main character's motivation?"
- "Explain the historical context behind this scene."
- "What is the tone of this paragraph and why?"
- "Translate the hardest sentence for me."

The AI uses the last few messages as conversation history and the current chapter text as background, so you don't need to paste the text into your question.

## Attach a sentence as context

For a question about a specific sentence, attach it directly:

1. Click the sentence in the reader to open the sentence toolbar.
2. Click the **Chat** button (speech bubble icon) in the toolbar.
3. The Insights sidebar opens with the sentence attached as a context chip at the bottom of the input.
4. Type your question and send — the exact sentence is included in the request to the AI.

The context chip shows a preview of the attached text with a remove button (×) if you change your mind before sending.

## Change the response language

The language selector at the top of the Insights panel controls the language of all AI responses. Changing it mid-conversation affects new responses only; past messages keep their original language. The default is set in **Profile → Insight & chat language**.

## Generate a fresh insight

Click the **refresh / retry icon** in the panel toolbar (top right) to generate a new auto-insight for the current chapter. This appends a new insight without deleting the conversation history.

## Adjust font size

Click the **A / a toggle** in the panel toolbar to switch the chat text between small and medium size. The preference is saved and persists across sessions.

## Load earlier messages

If you have a long conversation across many chapters, only the most recent messages are shown. Click **Load earlier** at the top of the message list to page back through the full history.

## Saved insights

The heart / save icon on any AI response saves the insight to the **Notes** panel under the current chapter. Saved insights appear on the Notes page alongside your annotations and vocabulary words.

## Tips

- **Ask early, ask often.** Insights are free to request and disposable — there's no penalty for regenerating if the first one misses the point.
- **Chain questions.** The chat remembers the last 6 turns, so "explain that metaphor more" works without re-pasting context.
- **Mix languages.** Read in German, ask questions in English, get answers in Chinese — the language selector is per-session, not per-book.
- **Use context clips for dense passages.** When a paragraph is genuinely hard, attaching it directly gives the AI the exact text instead of the first 800 characters of the chapter.
