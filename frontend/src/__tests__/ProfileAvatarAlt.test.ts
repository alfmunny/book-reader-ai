/**
 * Regression test for #2085 — profile avatar images inside aria-labeled buttons
 * must have alt="" so screen readers don't announce "profile" redundantly.
 *
 * WCAG 1.1.1: decorative images must have empty alt text.
 */
import * as fs from "fs";
import * as path from "path";

const homeSrc = fs.readFileSync(
  path.join(__dirname, "../components/SiteHeader.tsx"),
  "utf8",
);

const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Profile avatar alt text (closes #2085)", () => {
  it("home page profile picture has alt=\"\" not alt=\"profile\"", () => {
    expect(homeSrc).not.toContain('alt="profile"');
  });

  it("reader page profile picture has alt=\"\" not alt=\"profile\"", () => {
    expect(readerSrc).not.toContain('alt="profile"');
  });

  it("home page profile img has empty alt", () => {
    expect(homeSrc).toContain('src={session.backendUser.picture}');
    const idx = homeSrc.indexOf('src={session.backendUser.picture}');
    const window = homeSrc.slice(Math.max(0, idx - 20), idx + 100);
    expect(window).toContain('alt=""');
  });

  it("reader page profile img has empty alt", () => {
    expect(readerSrc).toContain('src={session.backendUser.picture}');
    const idx = readerSrc.indexOf('src={session.backendUser.picture}');
    const window = readerSrc.slice(Math.max(0, idx - 20), idx + 100);
    expect(window).toContain('alt=""');
  });
});
