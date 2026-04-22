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

test("unauthenticated visitor sees landing hero on discover tab", async ({ page }) => {
  await mockUnauthenticated(page);
  await page.goto("/");

  // The page should show the landing hero headline
  // JSX uses &rsquo; (U+2019) so we use .s wildcard to avoid ASCII vs curly-quote mismatch
  await expect(
    page.getByText(/Read the world.s greatest books/i)
  ).toBeVisible({ timeout: 5000 });

  // Sign-in CTA should be present
  await expect(page.getByRole("button", { name: /Sign in free/i })).toBeVisible();
});

test("authenticated user does not see landing hero", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/");

  // The page should NOT show the hero headline
  await expect(
    page.getByText(/Read the world.s greatest books/i)
  ).not.toBeVisible({ timeout: 3000 });
});
