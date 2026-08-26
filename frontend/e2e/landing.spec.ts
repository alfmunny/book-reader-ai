/**
 * E2E: Landing page hero visibility (#406)
 *
 * - Unauthenticated visitor: hero section is visible on the Discover tab
 * - Authenticated user: hero section is hidden
 */
import { test, expect } from "./base";
import { mockBackend } from "./fixtures";

async function mockUnauthenticated(page: import("@playwright/test").Page) {
  // Do NOT mock the auth session — let the E2E dev server handle it. Since no
  // auth cookie is present, NextAuth's /api/auth/session returns null and
  // useSession() reports status="unauthenticated".
  //
  // Stub backend routes that would otherwise fail (no real backend in E2E).
  await page.route("**/api/user/me", (route) =>
    route.fulfill({ status: 401, json: { detail: "Not authenticated" } })
  );
  await page.route("**/api/books/cached", (route) =>
    route.fulfill({ json: [] })
  );
  await page.route(/\/api\/books\/search\?/, (route) =>
    route.fulfill({ json: { count: 0, books: [] } })
  );
  await page.route("**/api/user/reading-progress*", (route) =>
    route.fulfill({ json: { entries: [] } })
  );
}

test("unauthenticated visitor still sees the catalog and a sign-in link", async ({ page }) => {
  await mockUnauthenticated(page);
  await page.goto("/");

  // The Discover landing hero went with the Discover tab (#2711); a signed-out
  // visitor now lands straight on the catalog.
  await expect(page.getByRole("heading", { name: "The Library" })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("link", { name: /Sign in/i })).toBeVisible();
});

test("unauthenticated visitor is not offered a bookshelf", async ({ page }) => {
  await mockUnauthenticated(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Your Bookshelf" })).toHaveCount(0);
});

test("authenticated user gets the bookshelf link", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Your Bookshelf" })).toBeVisible();
});
