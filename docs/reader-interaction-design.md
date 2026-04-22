# Reader Page — Interaction Design Model

_Last updated: 2026-04-22_

## Overview

The reader page combines three overlapping input systems: **TTS playback**, **text selection**, and **annotation**. Without clear rules about how they compose, interactions conflict (e.g. selection "Read" playing simultaneously with chapter audio, or long-press on mobile accidentally seeking instead of annotating). This document defines the authoritative interaction model.

---

## 1. Input Taxonomy

| Gesture | Desktop | Mobile |
|---------|---------|--------|
| Single click / tap on sentence | Seek TTS (no-op if paused) | Toggle toolbar visibility (center) / prev-next chapter (edge zones) |
| Single click on annotated sentence | Open QuickHighlightPanel | Same (if toolbar visible) |
| Click Play button | Start TTS from current position | Same (via bottom bar) |
| Drag to select text | Open SelectionToolbar | Not supported (touch pointer blocked) |
| Long-press 400 ms | Open AnnotationToolbar (legacy) | Open AnnotationToolbar |
| Swipe left / right | — | Navigate chapters |
| Spacebar | (currently unbound) | — |

---

## 2. TTS Playback States

```
idle → [Play] → loading → playing → paused
                              ↑____________↓
                           [seek while playing: repositions + continues]
                           [seek while paused: repositions only, no auto-start]
```

### Click-to-seek rules (implemented in PR #348)

- **Playing**: `seekTo(t)` repositions audio and continues playing.
- **Paused / idle / loading**: `seekTo(t)` is a no-op. The Play button must be pressed explicitly to start playback. This avoids accidental audio starting when the user merely clicks to read a sentence.

### Pause-on-interaction rule (**not yet implemented — see Issue #UX-004**)

When the user triggers a **one-off "Read selection"** action from the SelectionToolbar:

1. If chapter TTS is **playing**: pause it, play selection, then resume when selection audio ends.
2. If chapter TTS is **paused / idle**: play selection only (no chapter audio change).
3. If chapter TTS is **loading**: ignore "Read selection" (disabled=true state).

Currently, (1) plays both streams simultaneously — a bug.

---

## 3. Text Selection → SelectionToolbar

### Desktop

```
user drags to select text
       │
       ▼
window.selectionchange fires
       │
SelectionToolbar mounts at position above/below selection rect
       │
user clicks a button:
   ├─ Read ──────► pause chapter TTS → one-off speech → resume TTS on end
   ├─ Highlight ─► QuickHighlightPanel (4 color swatches, instant save, close)
   ├─ Note ──────► AnnotationToolbar (textarea, color, Save/Delete)
   ├─ Chat ──────► InsightChat sidebar opens, selection pre-filled
   └─ Word ──────► VocabWordTooltip (definition + Save)

After any button click: selection cleared, toolbar dismissed
```

### Mobile (touch)

Text selection is **not supported** on mobile because:
- `SentenceReader` calls `e.preventDefault()` on `pointerdown` (touch) to suppress the browser's native selection loupe.
- This was intentional (PR #324) to prevent the selection loupe from competing with the 400 ms long-press gesture.

**Current mobile annotation path:**
- Long-press (400 ms) → `onAnnotate(sentenceText, ci, position)` → AnnotationToolbar (full sentence only, not sub-sentence selection).

**Gap**: Mobile users cannot highlight a sub-sentence phrase. Possible future fix: add a native-like word/phrase selection mode using a custom handle-drag UI after the long-press fires.

---

## 4. Annotation Interactions

### Creating a highlight (desktop)

```
Select text → Highlight button → QuickHighlightPanel
    │ pick color ─────────────────────────────────────► saved immediately (no Save button)
    │ pencil icon ────────────────────────────────────► AnnotationToolbar opens for note
    │ click outside / Escape ────────────────────────► dismissed, no save
```

### Editing / deleting a highlight (desktop + mobile)

```
Click annotated sentence → QuickHighlightPanel (current color selected)
    │ pick different color ──────────────────────────► color updated immediately
    │ trash icon ────────────────────────────────────► deleted immediately (no confirm)
    │ pencil icon ────────────────────────────────────► AnnotationToolbar for note edit
    │ click outside / Escape ────────────────────────► dismissed
```

**Issue**: Immediate delete with no undo risks accidental data loss (see Issue #UX-005).

### Creating a note (desktop)

```
Select text → Note button → AnnotationToolbar
  OR
Long-press sentence → AnnotationToolbar

AnnotationToolbar:
    │ pick color
    │ type note (optional)
    │ Save ─────────────────────────────────────────► saved, toolbar dismissed
    │ Delete (existing only) ────────────────────────► deleted, dismissed
    │ Close / Escape ────────────────────────────────► dismissed, no save
```

---

## 5. Interaction Conflict Rules (Priority Order)

When multiple interactions are triggered simultaneously, resolve in this order:

1. **Modal panel open** (QuickHighlightPanel / AnnotationToolbar) → block all other interactions until dismissed.
2. **Text selection active** → SelectionToolbar shown, click-to-seek is inactive until selection cleared.
3. **TTS playing** → click-to-seek works, selection allowed, toolbar usable in parallel.
4. **TTS loading** (`disabled=true` on SentenceReader) → segment clicks ignored, SelectionToolbar still active for highlighting.

---

## 6. Keyboard Shortcuts (Desktop)

| Key | Action |
|-----|--------|
| `←` `→` | Prev / next chapter |
| `F` | Toggle focus mode |
| `Space` | Play / pause TTS (**not yet implemented — Issue #UX-006**) |
| `Escape` | Close open panel (AnnotationToolbar / QuickHighlightPanel / TypographyPanel) |
| `?` | Toggle shortcuts help |

---

## 7. Known Issues (to be filed)

| ID | Title | Severity |
|----|-------|----------|
| #UX-001 | Mobile: no text selection path for sub-sentence highlight | Medium |
| #UX-002 | Empty / error state when chapters fail to load | High |
| #UX-003 | SelectionToolbar "Read" plays simultaneously with chapter TTS | High |
| #UX-004 | Pause chapter TTS when selection "Read" fires | High |
| #UX-005 | Annotation delete has no undo or confirmation | Medium |
| #UX-006 | Spacebar shortcut for TTS play/pause missing | Medium |
| #UX-007 | Mobile bottom bar hidden when chapters fail to load | Medium |

---

## 8. Intended UX Principles

1. **Explicit play**: audio never starts without a deliberate user action (click Play, click Read). Seeking is always positioning-only when paused.
2. **One audio stream**: at most one stream plays at a time. Selection "Read" pauses chapter TTS; chapter TTS pauses one-off streams.
3. **Instant annotation**: QuickHighlightPanel saves on color click — zero friction for highlights.
4. **Full note when needed**: AnnotationToolbar is only shown when the user explicitly requests note editing (Note button or pencil icon).
5. **Non-destructive delete**: deletion of annotations should offer a brief undo window (3 s toast) rather than a confirmation dialog.
6. **Mobile-first reading**: chapter navigation (swipe, bottom bar), TTS (bottom bar Play), annotations (long-press) all have dedicated mobile paths. Selection-based features are desktop-only for now.
