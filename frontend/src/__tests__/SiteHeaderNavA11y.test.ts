/**
 * WCAG invariants for the global nav — the single way back to the library.
 *
 * These assertions used to live scattered across the page-level "← Library" /
 * "← Back" links that each route rendered for itself: focus rings (#2172,
 * #2185, #2350) and 44px touch targets (#816, #836, #860). Those links were
 * removed once the (shell) layout started rendering SiteHeader everywhere —
 * three stacked bars, two of which pointed home, was the complaint.
 *
 * The affordance did not disappear, it consolidated. So the coverage follows
 * it here rather than evaporating with the elements it used to describe.
 */

import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "..", "components", "SiteHeader.tsx"),
  "utf8",
);

/** The shared class helper every nav destination is rendered with. */
const linkClass = (() => {
  const i = src.indexOf("const linkClass");
  expect(i).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf("};", i));
})();

describe("SiteHeader — nav a11y (consolidated from the removed page back links)", () => {
  it("nav destinations meet the 44px mobile touch target (#816, #836, #860)", () => {
    expect(linkClass).toContain("min-h-[44px]");
  });

  it("desktop chrome keeps its natural compact size", () => {
    // The house rule is min-h-[44px] md:min-h-0 — never 44px unconditionally.
    expect(linkClass).toContain("md:min-h-0");
  });

  it("nav destinations have a visible focus ring for WCAG 2.4.7 (#2172, #2185, #2350)", () => {
    expect(linkClass).toContain("focus-visible:ring-2");
    expect(linkClass).toContain("focus-visible:ring-amber-400");
  });

  it("focus ring replaces the default outline rather than adding to it", () => {
    expect(linkClass).toContain("focus:outline-none");
  });

  it("Home is a real Link, not a router.push handler (#2449, #2451, #2453)", () => {
    // The old page back links were audited for this; the nav must hold the line.
    expect(src).toMatch(/<Link\s+href="\/"/);
    expect(src).not.toMatch(/onClick=\{\(\)\s*=>\s*router\.push\("\/"\)\}/);
  });

  it("the profile and sign-in controls also meet 44px", () => {
    const profile = src.slice(src.indexOf('href="/profile"'));
    expect(profile.slice(0, 600)).toContain("min-h-[44px]");
    const signin = src.slice(src.indexOf('href="/login"'));
    expect(signin.slice(0, 600)).toContain("min-h-[44px]");
  });
});
