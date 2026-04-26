/**
 * E2E: SelectionToolbar Highlight passes the user's selection (#1410)
 *
 * Originally (#407 / #400) this test asserted the toolbar must send the
 * **full sentence** because the renderer couldn't paint partial highlights.
 * Per #1410 the renderer now handles substring annotations correctly, and
 * the write path was changed to store what the user actually selected.
 */
import { test, expect } from "./base";
import { mockBackend, MOCK_CHAPTERS } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test("highlight sends the user's selected substring, not the full sentence", async ({ page }) => {
  // Capture the annotation POST body for assertion
  let annotationBody: Record<string, unknown> | null = null;
  await page.route("**/api/annotations", (route) => {
    if (route.request().method() === "POST") {
      annotationBody = route.request().postDataJSON() as Record<string, unknown>;
      route.fulfill({
        json: { id: 99, book_id: 1342, chapter_index: 0, sentence_text: annotationBody?.sentence_text, note_text: "", color: "yellow" },
      });
    } else {
      route.fulfill({ json: [] });
    }
  });

  await page.goto("/reader/1342");

  // Wait for the first chapter sentence AND the reader scroll container to be visible
  // before interacting — ensures SelectionToolbar's useEffect has registered its listener.
  const fullSentence = MOCK_CHAPTERS[0].text;
  await expect(page.getByText(fullSentence.slice(0, 30), { exact: false })).toBeVisible({ timeout: 5000 });
  await page.waitForSelector("#reader-scroll", { state: "visible", timeout: 5000 });
  await page.waitForSelector("[data-seg]", { state: "visible", timeout: 5000 });

  // Use evaluate to select just the first word ("It") inside the first [data-seg] span,
  // then dispatch selectionchange so SelectionToolbar picks it up.
  // Double-dispatch (after 2 RAF cycles) handles the race where React's useEffect
  // listener hasn't registered on the first dispatch.
  const segText = await page.evaluate(async () => {
    const seg = document.querySelector("[data-seg]");
    if (!seg || !seg.firstChild) return null;
    const range = document.createRange();
    // Select just the first two characters ("It") of the segment's text node
    range.setStart(seg.firstChild, 0);
    range.setEnd(seg.firstChild, Math.min(2, seg.firstChild.textContent?.length ?? 2));
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    // Wait 2 animation frames so React's useEffect has time to register listeners,
    // then dispatch again to ensure the toolbar state is set.
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    document.dispatchEvent(new Event("selectionchange"));
    return seg.textContent?.trim() ?? null;
  });

  // The segment must exist and contain text
  expect(segText).toBeTruthy();

  // SelectionToolbar should appear with Highlight button
  const highlightBtn = page.getByRole("button", { name: /highlight/i });
  await expect(highlightBtn).toBeVisible({ timeout: 6000 });

  // Click Highlight — this opens the QuickHighlightPanel with color choices
  await highlightBtn.click();

  // QuickHighlightPanel shows color buttons; click Yellow to trigger the annotation POST
  const yellowBtn = page.getByRole("button", { name: /yellow/i });
  await expect(yellowBtn).toBeVisible({ timeout: 6000 });
  await yellowBtn.click();

  // Verify the POST was made with just the user's selection ("It"), not the full sentence
  expect(annotationBody).not.toBeNull();
  const sentenceText = (annotationBody as Record<string, unknown>)?.sentence_text as string;
  expect(sentenceText).toBe("It");
  // Confirm it is NOT the full sentence
  expect(sentenceText).not.toBe(segText);
});
