/**
 * E2E: Book notes page — render, edit, delete, collapse, view modes, export, deep-links.
 */
import { test, expect } from "./base";
import { mockBackend } from "./fixtures";

const ANNOTATION = {
  id: 1,
  book_id: 1342,
  chapter_index: 0,
  sentence_text: "It is a truth universally acknowledged",
  note_text: "Opening line",
  color: "yellow",
};

function withAnnotation(page: import("@playwright/test").Page, patchNoteText = ANNOTATION.note_text) {
  // Use regex so /api/annotations/1 (PATCH/DELETE) is also matched, not just the list endpoint.
  return page.route(/\/api\/annotations/, (route) => {
    const method = route.request().method();
    if (method === "GET") {
      route.fulfill({ json: [ANNOTATION] });
    } else if (method === "PATCH") {
      route.fulfill({ json: { ...ANNOTATION, note_text: patchNoteText } });
    } else {
      route.fulfill({ json: { ok: true } });
    }
  });
}

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test("notes page: empty state when there are no notes", async ({ page }) => {
  // Override vocab to return empty so all counts are 0
  await page.route(/\/api\/vocabulary$/, (route) =>
    route.fulfill({ json: [] })
  );

  await page.goto("/notes/1342");

  await expect(page.getByText("No notes yet")).toBeVisible();
  await expect(page.getByRole("button", { name: /Open reader/ })).toBeVisible();
});

test("notes page: renders book title and annotation sentence", async ({ page }) => {
  await withAnnotation(page);

  await page.goto("/notes/1342");

  await expect(page.getByRole("heading", { name: "Pride and Prejudice" })).toBeVisible();
  await expect(page.getByText(/1 annotations/)).toBeVisible();
  await expect(page.getByText(/It is a truth universally acknowledged/).first()).toBeVisible();
  await expect(page.getByText("Opening line")).toBeVisible();
});

test("notes page: edit annotation saves updated note text", async ({ page }) => {
  await withAnnotation(page, "Famous opening line");

  await page.goto("/notes/1342");
  await expect(page.getByText("Opening line")).toBeVisible();

  await page.getByTitle("Edit note").click();

  const textarea = page.locator("textarea");
  await expect(textarea).toBeVisible();
  await expect(textarea).toHaveValue("Opening line");

  await textarea.clear();
  await textarea.fill("Famous opening line");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(textarea).not.toBeVisible();
  await expect(page.getByText("Famous opening line")).toBeVisible();
});

test("notes page: cancel edit restores original note text", async ({ page }) => {
  await withAnnotation(page);

  await page.goto("/notes/1342");
  await page.getByTitle("Edit note").click();

  const textarea = page.locator("textarea");
  await textarea.clear();
  await textarea.fill("Discarded change");
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(textarea).not.toBeVisible();
  await expect(page.getByText("Opening line")).toBeVisible();
  await expect(page.getByText("Discarded change")).not.toBeVisible();
});

test("notes page: delete annotation removes it from the list", async ({ page }) => {
  await withAnnotation(page);

  await page.goto("/notes/1342");
  await expect(page.getByText(/It is a truth universally acknowledged/).first()).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTitle("Delete annotation").click();

  // Sentence quote gone; only vocab words remain (no annotation heading)
  await expect(page.getByText(/^"It is a truth universally acknowledged"$/).first()).not.toBeVisible();
});

test("notes page: collapse all hides content; expand all reveals it", async ({ page }) => {
  await withAnnotation(page);

  await page.goto("/notes/1342");
  // Content visible before collapse
  await expect(page.getByText("Opening line")).toBeVisible();

  await page.getByRole("button", { name: "Collapse all" }).click();
  await expect(page.getByText("Opening line")).not.toBeVisible();
  // Button label flips
  await expect(page.getByRole("button", { name: "Expand all" })).toBeVisible();

  await page.getByRole("button", { name: "Expand all" }).click();
  await expect(page.getByText("Opening line")).toBeVisible();
});

test("notes page: 'By chapter' view shows chapter heading instead of section heading", async ({ page }) => {
  await withAnnotation(page);

  await page.goto("/notes/1342");

  // Section view: "Annotations" section heading is visible
  await expect(page.getByRole("button", { name: /Annotations/ })).toBeVisible();

  await page.getByRole("button", { name: "By chapter" }).click();

  // Chapter view: "Annotations" section heading gone; chapter heading appears
  await expect(page.getByRole("button", { name: /Annotations/ })).not.toBeVisible();
  // chapters[0].title = "Chapter I" in mock; \b ensures "Chapter II" is not matched
  await expect(page.getByRole("button", { name: /\bChapter I\b/ })).toBeVisible();
});

test("notes page: annotation chapter link points to reader URL with sentence", async ({ page }) => {
  await withAnnotation(page);

  await page.goto("/notes/1342");

  const link = page.getByRole("link", { name: /→ Chapter/ });
  await expect(link).toBeVisible();

  const href = await link.getAttribute("href");
  expect(href).toContain("/reader/1342");
  expect(href).toContain("chapter=0");
  expect(href).toContain(encodeURIComponent("It is a truth universally acknowledged"));
});

test("notes page: export button shows obsidian URL on success", async ({ page }) => {
  await withAnnotation(page);

  // Override export to return a URL
  await page.route(/\/api\/vocabulary\/export/, (route) =>
    route.fulfill({ json: { urls: ["obsidian://open?vault=MyVault&file=vocab.md"] } })
  );

  await page.goto("/notes/1342");

  await page.getByRole("button", { name: /Export/ }).click();

  await expect(page.getByText(/Exported → obsidian:\/\//)).toBeVisible();
});
