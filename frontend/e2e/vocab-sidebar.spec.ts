/**
 * E2E: Vocab sidebar — chapter filter toggle and vocabulary page highlight.
 */
import { test, expect } from "./base";
import { mockBackend } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test("vocab sidebar opens with 'This chapter' and 'All chapters' toggles", async ({ page }) => {
  await page.goto("/reader/1342");

  const vocabBtn = page.getByTitle("Vocabulary", { exact: true });
  await vocabBtn.click();

  await expect(page.getByRole("button", { name: "This chapter" })).toBeVisible();
  await expect(page.getByRole("button", { name: "All chapters" })).toBeVisible();
});

test("vocab sidebar chapter filter: default shows only chapter-0 word", async ({ page }) => {
  await page.goto("/reader/1342");

  const vocabBtn = page.getByTitle("Vocabulary", { exact: true });
  await vocabBtn.click();

  // Word card header buttons start with the lemma — "universal universally" for chapter-0 word
  await expect(page.getByRole("button", { name: "universal universally" })).toBeVisible();
  // "acknowledged" word card (chapter 1) should be absent — its header is "acknowledge acknowledged"
  await expect(page.getByRole("button", { name: "acknowledge acknowledged" })).not.toBeVisible();
});

test("vocab sidebar 'All chapters' toggle shows words from every chapter", async ({ page }) => {
  await page.goto("/reader/1342");

  const vocabBtn = page.getByTitle("Vocabulary", { exact: true });
  await vocabBtn.click();

  // Switch to all chapters
  await page.getByRole("button", { name: "All chapters" }).click();

  // Both word cards should now be visible
  await expect(page.getByRole("button", { name: "universal universally" })).toBeVisible();
  await expect(page.getByRole("button", { name: "acknowledge acknowledged" })).toBeVisible();
});

test("vocab sidebar: clicking an occurrence closes the sidebar", async ({ page }) => {
  await page.goto("/reader/1342");

  const vocabBtn = page.getByTitle("Vocabulary", { exact: true });
  await vocabBtn.click();

  // The filter toggle is the landmark for "sidebar is open"
  await expect(page.getByRole("button", { name: "This chapter" })).toBeVisible();

  // Click the context occurrence for "universally" (chapter 0, same chapter as reader)
  // Occurrence button is the only <button> containing this quoted sentence text
  await page.getByRole("button", { name: /It is a truth universally acknowledged/ }).click();

  // Sidebar closes
  await expect(page.getByRole("button", { name: "This chapter" })).not.toBeVisible();
});

test("vocab sidebar: 'All chapters' view shows chapter labels on occurrences", async ({ page }) => {
  await page.goto("/reader/1342");

  const vocabBtn = page.getByTitle("Vocabulary", { exact: true });
  await vocabBtn.click();

  await page.getByRole("button", { name: "All chapters" }).click();

  // "universally" is chapter_index=0 → Ch.1; "acknowledged" is chapter_index=1 → Ch.2
  await expect(page.getByText("Ch.1")).toBeVisible();
  await expect(page.getByText("Ch.2")).toBeVisible();
});

test("vocab page: target word card has amber highlight ring", async ({ page }) => {
  await page.goto("/vocabulary?word=universally");

  // Wait for the lemma card to appear (lemma "universal" for form "universally")
  await expect(page.getByText("universal").first()).toBeVisible({ timeout: 10000 });

  // The card should have the ring-2 ring-amber-300 highlight class (isTarget = true)
  const card = page.locator(".ring-2.ring-amber-300").first();
  await expect(card).toBeVisible();
});
