/**
 * E2E: SelectionToolbar must not appear mid-drag (#2655)
 *
 * The unit tests dispatch synthetic MouseEvents named "pointerdown"/"pointerup",
 * which is as close as JSDOM gets. This test drives a real Chromium mouse drag so
 * the browser's own selection machinery fires `selectionchange` continuously, which
 * is the condition that used to mount the toolbar under the cursor and swallow the
 * pointer events needed to keep extending the selection.
 */
import { test, expect } from "./base";
import { mockBackend } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

const SELECTION_TOOLBAR = { name: "Text selection actions" };

test("selection toolbar stays hidden during a drag and appears on release", async ({ page }) => {
  await page.goto("/reader/1342");

  await page.waitForSelector("#reader-scroll", { state: "visible", timeout: 5000 });
  await page.waitForSelector("[data-seg]", { state: "visible", timeout: 5000 });

  const seg = page.locator("[data-seg]").first();
  const box = await seg.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  // Drag left-to-right along the segment's first line of text.
  const y = box.y + 8;
  const startX = box.x + 2;

  await page.mouse.move(startX, y);
  await page.mouse.down();

  // Part-way through the gesture: the browser has selected text and has been
  // firing selectionchange, but the button is still down.
  await page.mouse.move(startX + Math.min(120, box.width - 10), y, { steps: 12 });

  const midDragSelection = await page.evaluate(() =>
    window.getSelection()?.toString().trim() ?? ""
  );
  // Guard: if nothing got selected the "toolbar is hidden" assertion below would
  // pass for the wrong reason.
  expect(midDragSelection.length).toBeGreaterThanOrEqual(2);

  await expect(page.getByRole("toolbar", SELECTION_TOOLBAR)).toHaveCount(0);

  // Keep extending — this is the step the mounted toolbar used to block.
  await page.mouse.move(startX + Math.min(240, box.width - 4), y, { steps: 12 });

  const extendedSelection = await page.evaluate(() =>
    window.getSelection()?.toString().trim() ?? ""
  );
  expect(extendedSelection.length).toBeGreaterThan(midDragSelection.length);
  await expect(page.getByRole("toolbar", SELECTION_TOOLBAR)).toHaveCount(0);

  // Release: the toolbar resolves once, against the final selection.
  await page.mouse.up();
  await expect(page.getByRole("toolbar", SELECTION_TOOLBAR)).toBeVisible({ timeout: 5000 });
});

test("starting a second drag clears the toolbar left over from the first", async ({ page }) => {
  await page.goto("/reader/1342");

  await page.waitForSelector("#reader-scroll", { state: "visible", timeout: 5000 });
  await page.waitForSelector("[data-seg]", { state: "visible", timeout: 5000 });

  const box = await page.locator("[data-seg]").first().boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const y = box.y + 8;
  const startX = box.x + 2;

  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + Math.min(120, box.width - 10), y, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole("toolbar", SELECTION_TOOLBAR)).toBeVisible({ timeout: 5000 });

  // A fresh press must drop the stale toolbar immediately rather than leaving it
  // parked over the text for the duration of the new gesture.
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await expect(page.getByRole("toolbar", SELECTION_TOOLBAR)).toHaveCount(0);
  await page.mouse.up();
});
