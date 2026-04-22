/**
 * E2E: SelectionToolbar Highlight passes full sentence context (#407)
 *
 * When a user selects a word and clicks Highlight, the annotation POST
 * must send the **full sentence** (from the nearest [data-seg] element)
 * as sentence_text — not just the selected substring.
 */
import { test, expect } from "./base";
import { mockBackend, MOCK_CHAPTERS } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test("highlight sends full sentence text, not raw selection substring", async ({ page }) => {
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

  // Wait for the first chapter sentence to appear
  const fullSentence = MOCK_CHAPTERS[0].text;
  await expect(page.getByText(fullSentence.slice(0, 30), { exact: false })).toBeVisible({ timeout: 5000 });

  // Use evaluate to select just the first word ("It") inside the first [data-seg] span,
  // then dispatch selectionchange so SelectionToolbar picks it up.
  const segText = await page.evaluate(() => {
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
    return seg.textContent?.trim() ?? null;
  });

  // The segment must exist and contain text
  expect(segText).toBeTruthy();

  // SelectionToolbar should appear with Highlight button
  const highlightBtn = page.getByRole("button", { name: /highlight/i });
  await expect(highlightBtn).toBeVisible({ timeout: 3000 });

  // Click Highlight — this opens the QuickHighlightPanel with color choices
  await highlightBtn.click();

  // QuickHighlightPanel shows color buttons; click Yellow to trigger the annotation POST
  const yellowBtn = page.getByRole("button", { name: /yellow/i });
  await expect(yellowBtn).toBeVisible({ timeout: 3000 });
  await yellowBtn.click();

  // Verify the POST was made with the full sentence, not just "It"
  expect(annotationBody).not.toBeNull();
  const sentenceText = (annotationBody as Record<string, unknown>)?.sentence_text as string;
  expect(sentenceText).not.toBe("It");
  expect(sentenceText).toBe(segText);
  // Confirm it contains the full sentence text
  expect(sentenceText.length).toBeGreaterThan(5);
});
