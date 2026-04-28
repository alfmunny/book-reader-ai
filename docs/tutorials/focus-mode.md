# Read without distractions using Focus mode

Focus mode hides the reader's toolbars and sidebars so the only thing on screen is the text. It's designed for long reading sessions where the UI chrome becomes noise.

## How to enter Focus mode

**Keyboard shortcut (fastest):** press **F** while reading. Press **F** again, or **Escape**, to exit.

**Button:** click the **Focus** button in the reader's right toolbar (the button is labeled with a focus/target icon). The same button appears in the Focus mode HUD to exit.

## What changes in Focus mode

- All toolbars, sidebars, and the header collapse and disappear.
- A minimal HUD appears at the top center of the screen with: Previous chapter, current chapter title, Next chapter, Paragraph focus toggle, Typography settings, and an Exit focus mode button.
- The text fills the full width of the reading area (respecting your content-width setting).

## Navigate in Focus mode

- **Previous / Next chapter:** click the Prev and Next buttons in the HUD, or press **← →** arrow keys.
- **Typography:** click **Aa** in the HUD to open the typography panel without exiting Focus mode.
- **Exit:** press **F**, **Escape**, or click the **Focus** label button in the HUD.

## Paragraph focus

Paragraph focus is a sub-mode that dims all paragraphs except the one your cursor is hovering over. It helps you read one paragraph at a time without losing your place.

Enable it from the HUD while in Focus mode:

1. Enter Focus mode (press **F**).
2. Click the **Read para** button in the HUD to enable paragraph focus.

Or enable it globally via **Typography → Paragraph focus** toggle — it then stays on across sessions.

When paragraph focus is on and you hover a paragraph, the HUD shows a **Read para** button that reads the paragraph aloud via TTS.

## Keyboard shortcuts in Focus mode

| Key | Action |
|---|---|
| `F` | Toggle Focus mode |
| `Escape` | Exit Focus mode |
| `←` | Previous chapter |
| `→` | Next chapter |
| `Space` | Play / pause TTS |
| `?` | Show all keyboard shortcuts |

## Tips

- **Use with full-screen browser mode** (F11 / Cmd+Ctrl+F on Mac) for a completely distraction-free reading experience.
- **Paragraph focus + TTS is effective for dense text.** The reader highlights the paragraph being spoken and dims the rest, making it easy to follow along.
- **Typography settings persist** between Focus and non-Focus mode — adjust font size or line height once in the HUD and it applies everywhere.

## Troubleshooting

- **HUD disappeared** — move your cursor to the top center of the screen to reveal it. It fades after a few seconds of inactivity.
- **F key doesn't toggle Focus mode** — make sure focus is not inside a text input (search box, annotation editor, etc.). Click on the text body first, then press F.
- **Sidebars reappear when I exit Focus mode** — the sidebar state that was active before you entered Focus mode is restored on exit. This is intentional.
