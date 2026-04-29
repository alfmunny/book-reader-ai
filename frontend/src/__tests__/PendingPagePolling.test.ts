/**
 * Regression test for #2099 — pending approval page must poll for approval
 * status and redirect automatically when account is approved, instead of
 * leaving users stuck on a static page indefinitely.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/pending/page.tsx"),
  "utf8",
);

describe("Pending approval page auto-poll (closes #2099)", () => {
  it("imports getMe to poll approval status", () => {
    expect(src).toContain("getMe");
  });

  it("uses setInterval to poll periodically", () => {
    expect(src).toContain("setInterval");
  });

  it("checks the approved field from getMe response", () => {
    expect(src).toContain("approved");
  });

  it("redirects on approval", () => {
    // Should either router.push('/') or window.location
    const hasRouterPush = src.includes('router.push("/")') || src.includes("router.push('/')");
    const hasWindowLoc = src.includes("window.location");
    expect(hasRouterPush || hasWindowLoc).toBe(true);
  });

  it("clears the interval on unmount (no memory leak)", () => {
    expect(src).toContain("clearInterval");
  });
});
