/**
 * E2E: Word lookup — double-click to look up a word's dictionary definition.
 *
 * The reader supports a desktop "double-click a word" flow that opens a popup
 * with dictionary definitions from dictionaryapi.dev. These tests mock that
 * external API to keep tests hermetic.
 */
import { test, expect, Page } from "./base";
import { mockBackend, MOCK_CHAPTERS } from "./fixtures";

const MOCK_DEFINITION = [
  {
    word: "truth",
    phonetic: "/truːθ/",
    meanings: [
      {
        partOfSpeech: "noun",
        definitions: [
          { definition: "the quality or state of being true" },
          { definition: "that which is true or in accordance with fact or reality" },
        ],
      },
    ],
  },
];

async function setupLookup(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockBackend(page);
  await page.route("**/api/annotations/*", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/user/reading-progress", (r) => r.fulfill({ json: [] }));

  // Mock the dictionary API (used by both WordLookup and WordActionDrawer)
  await page.route("**dictionaryapi.dev**", (r) =>
    r.fulfill({ json: MOCK_DEFINITION })
  );
}

/**
 * Programmatically select a word and fire a synthetic dblclick on the reader
 * scroll container. Using a synthetic event avoids the browser's native
 * double-click behaviour (which clears the programmatic selection before the
 * React handler can read it).
 */
async function triggerWordLookup(page: Page, word: string) {
  await page.evaluate((w) => {
    const scroll = document.getElementById("reader-scroll");
    if (!scroll) return;

    // 1. Walk text nodes to find and select the word
    const walker = document.createTreeWalker(scroll, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    let found = false;
    while (node) {
      const idx = node.textContent?.indexOf(w) ?? -1;
      if (idx !== -1) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + w.length);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
        found = true;
        break;
      }
      node = walker.nextNode() as Text | null;
    }
    if (!found) return;

    // 2. Fire a synthetic dblclick on the scroll container — does NOT move the
    //    mouse pointer, so the programmatic selection stays intact when the
    //    React onDoubleClick handler reads window.getSelection().
    const rect = scroll.getBoundingClientRect();
    scroll.dispatchEvent(
      new MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 3,
      })
    );
  }, word);
}

test.describe("Word lookup popup", () => {
  test.beforeEach(async ({ page }) => {
    await setupLookup(page);
    await page.goto("/reader/1342");
    await expect(
      page.getByText(MOCK_CHAPTERS[0].text.slice(0, 20), { exact: false })
    ).toBeVisible({ timeout: 10000 });
  });

  test("double-clicking a word opens the lookup popup", async ({ page }) => {
    await triggerWordLookup(page, "truth");
    // The phonetic from the mock confirms the popup opened (not just chapter text)
    await expect(page.getByText("/truːθ/")).toBeVisible({ timeout: 5000 });
  });

  test("word lookup displays phonetic transcription", async ({ page }) => {
    await triggerWordLookup(page, "truth");
    await expect(page.getByText("/truːθ/")).toBeVisible({ timeout: 5000 });
  });

  test("word lookup displays dictionary definition", async ({ page }) => {
    await triggerWordLookup(page, "truth");
    await expect(
      page.getByText("the quality or state of being true", { exact: false })
    ).toBeVisible({ timeout: 5000 });
  });

  test("word lookup shows part of speech", async ({ page }) => {
    await triggerWordLookup(page, "truth");
    await expect(page.getByText("noun", { exact: false })).toBeVisible({ timeout: 5000 });
  });

  test("word lookup shows error message for unknown word", async ({ page }) => {
    // Override dictionary mock to return 404 for this test
    await page.route("**dictionaryapi.dev**", (r) =>
      r.fulfill({ status: 404, json: { message: "No Definitions Found" } })
    );

    await triggerWordLookup(page, "truth");
    await expect(page.getByText("No definition found")).toBeVisible({ timeout: 5000 });
  });

  test("word lookup closes on Escape key", async ({ page }) => {
    await triggerWordLookup(page, "truth");
    await expect(page.getByText("/truːθ/")).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("Escape");
    await expect(page.getByText("/truːθ/")).not.toBeVisible({ timeout: 3000 });
  });

  test("word lookup closes when clicking outside", async ({ page }) => {
    await triggerWordLookup(page, "truth");
    await expect(page.getByText("/truːθ/")).toBeVisible({ timeout: 5000 });

    // Click in the empty reading area far from the popup
    await page.mouse.click(50, 500);
    await expect(page.getByText("/truːθ/")).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe("Word lookup — single-word constraint", () => {
  test.beforeEach(async ({ page }) => {
    await setupLookup(page);
    await page.goto("/reader/1342");
    await expect(
      page.getByText(MOCK_CHAPTERS[0].text.slice(0, 20), { exact: false })
    ).toBeVisible({ timeout: 10000 });
  });

  test("selecting a multi-word phrase does not open lookup", async ({ page }) => {
    // Select "a truth" (contains space — the handler rejects /\s/ selections)
    await page.evaluate(() => {
      const scroll = document.getElementById("reader-scroll");
      if (!scroll) return;
      const walker = document.createTreeWalker(scroll, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text | null;
      while (node) {
        const idx = node.textContent?.indexOf("a truth") ?? -1;
        if (idx !== -1) {
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + 7); // "a truth" — 7 chars with a space
          window.getSelection()!.removeAllRanges();
          window.getSelection()!.addRange(range);

          const rect = scroll.getBoundingClientRect();
          scroll.dispatchEvent(
            new MouseEvent("dblclick", {
              bubbles: true,
              cancelable: true,
              clientX: rect.left + rect.width / 2,
              clientY: rect.top + rect.height / 3,
            })
          );
          return;
        }
        node = walker.nextNode() as Text | null;
      }
    });

    // Popup should NOT appear (space in selection triggers the guard)
    await expect(page.getByText("/truːθ/")).not.toBeVisible({ timeout: 2000 });
  });
});
