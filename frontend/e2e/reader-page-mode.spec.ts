/**
 * E2E: Reader page mode — the acceptance criteria from #2784 that need real
 * layout. jsdom reports zero widths, so column geometry can only be verified
 * in a browser.
 */
import { test, expect } from "./base";
import { mockBackend } from "./fixtures";

// A chapter long enough to paginate into several pages at 1280x720.
const LONG_TEXT = Array.from({ length: 40 }, (_, i) =>
  `Paragraph ${i + 1}. ${"The quick brown fox jumps over the lazy dog and keeps running through the long afternoon. ".repeat(4)}`,
).join("\n\n");

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
  await page.route(/\/api\/books\/\d+\/chapters$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        book_id: 1342,
        chapters: [
          { title: "Chapter I", text: LONG_TEXT },
          { title: "Chapter II", text: LONG_TEXT },
        ],
      }),
    }),
  );
});

async function enterPageMode(page: import("@playwright/test").Page) {
  await page.goto("/reader/1342");
  await expect(page.getByText("Paragraph 1.", { exact: false })).toBeVisible();
  await page.getByTestId("reader-mode-toggle").click();
  await expect(page.getByTestId("page-turn-controls")).toBeVisible();
}

test("page mode paginates the chapter and the last page is reachable", async ({ page }) => {
  await enterPageMode(page);

  const position = page.getByTestId("page-position");
  await expect(position).toContainText(/Page 1 of \d+/);
  const total = Number((await position.textContent())!.match(/of (\d+)/)![1]);
  expect(total).toBeGreaterThan(1);

  await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();
  for (let i = 1; i < total; i++) {
    await page.getByRole("button", { name: "Next page" }).click();
  }
  await expect(position).toContainText(`Page ${total} of ${total}`);
  await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
});

test("the page count re-measures when the layout reflows", async ({ page }) => {
  // Pagination is a function of the layout, so anything that reflows the text
  // must re-measure. A viewport change is the reflow this can drive directly;
  // the typography dependencies are pinned in ReaderPageMode.test.ts.
  await enterPageMode(page);
  const read = async () =>
    Number((await page.getByTestId("page-position").textContent())!.match(/of (\d+)/)![1]);

  const tall = await read();
  expect(tall).toBeGreaterThan(1);

  // Height, not width: the reading measure is capped by .prose-reader, so
  // narrowing the window either changes nothing or crosses a responsive
  // breakpoint into a different layout. A shorter column is monotonic.
  await page.setViewportSize({ width: 1280, height: 460 });
  await expect.poll(read).toBeGreaterThan(tall);
});

test("arrows turn pages while paginated; brackets still change chapter", async ({ page }) => {
  await enterPageMode(page);
  const position = page.getByTestId("page-position");

  await page.getByTestId("reader-flow").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ArrowRight");
  await expect(position).toContainText("Page 2 of");
  await page.keyboard.press("ArrowLeft");
  await expect(position).toContainText("Page 1 of");

  // ] moves to the next chapter, which reopens on its first page (decision 3)
  await page.keyboard.press("]");
  await expect(page.getByTestId("reader-chapter-heading")).toContainText("Chapter II");
  await expect(position).toContainText("Page 1 of");
});

test("the mode survives a reload", async ({ page }) => {
  await enterPageMode(page);
  await page.reload();
  await expect(page.getByTestId("page-turn-controls")).toBeVisible();
  await expect(page.getByTestId("reader-mode-toggle")).toHaveAttribute("aria-pressed", "true");
});

test("switching modes keeps the very same paragraph nodes", async ({ page }) => {
  // The whole argument for CSS columns over JS chunking: nothing is re-created,
  // so note anchors and data-seg spans keep their identity across a switch.
  await page.goto("/reader/1342");
  await expect(page.getByText("Paragraph 1.", { exact: false })).toBeVisible();

  await page.evaluate(() => {
    const p = document.querySelector("[data-testid='reader-flow'] p, #reader-scroll p");
    if (p) (p as HTMLElement).dataset.identityProbe = "kept";
  });

  await page.getByTestId("reader-mode-toggle").click();
  await expect(page.getByTestId("page-turn-controls")).toBeVisible();

  const survived = await page.evaluate(
    () => !!document.querySelector("[data-identity-probe='kept']"),
  );
  expect(survived).toBe(true);
});
