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

/** {first, total} from the readout — "Pages 3–4 of 26" or "Page 3 of 13". */
async function readPos(page: import("@playwright/test").Page) {
  const text = (await page.getByTestId("page-position").textContent())!;
  return {
    first: Number(text.match(/Pages? (\d+)/)![1]),
    total: Number(text.match(/of (\d+)/)![1]),
  };
}

/** How many pages a leaf shows — 2 on a wide window, 1 on a narrow one. */
async function perView(page: import("@playwright/test").Page) {
  return Number(await page.evaluate(
    () => getComputedStyle(document.querySelector("[data-testid='reader-flow']")!).columnCount,
  ));
}

/** Click Next until the last leaf of the chapter is showing. */
async function toLastLeaf(page: import("@playwright/test").Page) {
  const { total } = await readPos(page);
  const per = await perView(page);
  const lastFirst = per * Math.floor((total - 1) / per) + 1;
  for (let guard = 0; guard < 60; guard++) {
    if ((await readPos(page)).first >= lastFirst) break;
    await page.getByRole("button", { name: "Next page" }).click();
  }
  return { total, per, lastFirst };
}

async function enterPageMode(page: import("@playwright/test").Page) {
  await page.goto("/reader/1342");
  await expect(page.getByText("Paragraph 1.", { exact: false })).toBeVisible();
  await page.getByTestId("reader-mode-toggle").click();
  await expect(page.getByTestId("page-turn-controls")).toBeVisible();
}

test("page mode paginates the chapter and the last page is reachable", async ({ page }) => {
  await enterPageMode(page);

  const position = page.getByTestId("page-position");
  await expect(position).toContainText(/Pages? 1(–2)? of \d+/);
  const total = Number((await position.textContent())!.match(/of (\d+)/)![1]);
  expect(total).toBeGreaterThan(1);

  // First page of the first chapter is the start of the book
  await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();

  const { lastFirst } = await toLastLeaf(page);
  expect((await readPos(page)).first).toBe(lastFirst);
  // …but the last page of a chapter is not a dead end
  await expect(page.getByRole("button", { name: "Next page" })).toBeEnabled();
});

test("turning past a chapter edge continues into the neighbouring chapter", async ({ page }) => {
  await enterPageMode(page);
  const heading = page.getByTestId("reader-chapter-heading");
  const { lastFirst } = await toLastLeaf(page);

  // Forward past the last leaf opens the next chapter at its first page
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(heading).toContainText("Chapter II");
  expect((await readPos(page)).first).toBe(1);

  // Backwards past the first page returns to the previous chapter's LAST leaf
  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(heading).toContainText("Chapter I");
  expect((await readPos(page)).first).toBe(lastFirst);
});

test("a wide window shows two equal pages; the rest is clipped", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await enterPageMode(page);

  await expect(page.getByTestId("page-position")).toContainText(/Pages 1–2 of \d+/);

  const { clipWidth, flowWidth, columns } = await page.evaluate(() => {
    const clip = document.querySelector<HTMLElement>("[data-testid='reader-page-clip']")!;
    const flow = document.querySelector<HTMLElement>("[data-testid='reader-flow']")!;
    return {
      clipWidth: clip.clientWidth,
      flowWidth: flow.clientWidth,
      columns: getComputedStyle(flow).columnCount,
    };
  });
  // Two columns, and the clip is exactly the leaf — so no third page shows
  expect(columns).toBe("2");
  expect(Math.abs(clipWidth - flowWidth)).toBeLessThan(2);
  expect(await page.evaluate(
    () => getComputedStyle(document.querySelector("[data-testid='reader-page-clip']")!).overflow,
  )).toBe("hidden");
});

test("a narrow window falls back to a single page", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await enterPageMode(page);
  await expect(page.getByTestId("page-position")).toContainText(/Page 1 of \d+/);
  expect(await page.evaluate(
    () => getComputedStyle(document.querySelector("[data-testid='reader-flow']")!).columnCount,
  )).toBe("1");
});

test("a turn advances the whole leaf", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await enterPageMode(page);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByTestId("page-position")).toContainText(/Pages 3–4 of \d+/);
  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(page.getByTestId("page-position")).toContainText(/Pages 1–2 of \d+/);
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
  await expect(position).not.toContainText(/Pages? 1(–2)? of/);
  await page.keyboard.press("ArrowLeft");
  await expect(position).toContainText(/Pages? 1(–2)? of/);

  // ] moves to the next chapter, which reopens on its first page (decision 3)
  await page.keyboard.press("]");
  await expect(page.getByTestId("reader-chapter-heading")).toContainText("Chapter II");
  await expect(position).toContainText(/Pages? 1(–2)? of/);
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

test("entering a chapter cuts to the page — it does not sweep across the chapter", async ({ page }) => {
  await enterPageMode(page);
  const { lastFirst } = await toLastLeaf(page);

  // Watch the transform while turning back into the previous chapter. If the
  // jump animated, intermediate frames would show offsets between 0 and the
  // last leaf; a cut shows only the destination.
  await page.getByRole("button", { name: "Next page" }).click();   // → Chapter II
  await expect(page.getByTestId("reader-chapter-heading")).toContainText("Chapter II");

  await page.evaluate(() => {
    const flow = document.querySelector<HTMLElement>("[data-testid='reader-flow']")!;
    (window as unknown as { __x: number[] }).__x = [];
    const tick = () => {
      const m = /translateX\((-?[\d.]+)px\)/.exec(flow.style.transform || "");
      if (m) (window as unknown as { __x: number[] }).__x.push(Number(m[1]));
      requestAnimationFrame(tick);
    };
    tick();
  });

  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(page.getByTestId("reader-chapter-heading")).toContainText("Chapter I");
  expect((await readPos(page)).first).toBe(lastFirst);
  await page.waitForTimeout(400); // longer than the 260ms turn transition

  const offsets = await page.evaluate(() => (window as unknown as { __x: number[] }).__x);
  const dest = Math.min(...offsets); // most negative = the last leaf
  expect(dest).toBeLessThan(0);
  // Frames sit either at the starting offset or at the destination. An
  // animated sweep would leave partial offsets strictly between the two.
  const between = offsets.filter((x) => x < 0 && x > dest);
  expect(between).toHaveLength(0);
});

test("the book progress bar advances as pages turn", async ({ page }) => {
  await enterPageMode(page);
  const bar = page.getByRole("progressbar").first();
  const read = async () => Number(await bar.getAttribute("aria-valuenow"));

  const start = await read();
  await page.getByRole("button", { name: "Next page" }).click();
  await page.getByRole("button", { name: "Next page" }).click();
  expect(await read()).toBeGreaterThan(start);

  // …and reaches the end of the chapter on its last leaf
  await toLastLeaf(page);
  const { total } = await readPos(page);
  const per = await perView(page);
  if (total > per) expect(await read()).toBeGreaterThan(start);
});

test("keyboard sentence navigation turns the page to reach its sentence", async ({ page }) => {
  await enterPageMode(page);
  // Jump to the far end of the chapter, then start sentence-select mode: the
  // first sentence lives on page 1, so the reader must turn back to it.
  await toLastLeaf(page);
  expect((await readPos(page)).first).toBeGreaterThan(1);

  // Focus the container rather than clicking the flow, which is mid-turn and
  // therefore never "stable" for Playwright.
  await page.evaluate(() => document.getElementById("reader-scroll")?.focus());
  await page.keyboard.press("n");
  await expect.poll(async () => (await readPos(page)).first).toBe(1);
});

test("a turn sticks while the reader is following along", async ({ page }) => {
  // Regression (owner, 2026-08-31): onFollowSegment changed identity on every
  // turn and sat in the follow effects' dependency lists, so turning a page
  // re-fired the follow and snapped straight back — pages would not turn.
  await enterPageMode(page);

  // Drive the follow path the same way playback does, then turn.
  await page.evaluate(() => {
    const el = document.querySelectorAll<HTMLElement>("[data-seg]")[0];
    el?.scrollIntoView({ block: "nearest" });
  });

  const start = (await readPos(page)).first;
  await page.getByRole("button", { name: "Next page" }).click();
  const after = (await readPos(page)).first;
  expect(after).toBeGreaterThan(start);

  // Give any stray follow effect several frames to yank it back
  await page.waitForTimeout(500);
  expect((await readPos(page)).first).toBe(after);

  // …and a second turn still moves
  await page.getByRole("button", { name: "Next page" }).click();
  expect((await readPos(page)).first).toBeGreaterThan(after);
});

test("the chapter nav row is gone in page mode", async ({ page }) => {
  await page.goto("/reader/1342");
  await expect(page.getByTestId("bottom-prev-chapter")).toBeVisible();

  await page.getByTestId("reader-mode-toggle").click();
  await expect(page.getByTestId("page-turn-controls")).toBeVisible();
  // Not merely hidden behind the turn controls — absent, so no stray edge of
  // it stays clickable.
  await expect(page.getByTestId("bottom-prev-chapter")).toHaveCount(0);
  await expect(page.getByTestId("bottom-next-chapter")).toHaveCount(0);
});
