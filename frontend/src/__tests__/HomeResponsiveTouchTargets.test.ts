/**
 * Regression test for #2132 — home page interactive elements that have
 * explicit responsive desktop sizing must also include md:min-h-0 so the
 * mobile 44px touch target doesn't override the desktop size.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf8",
);

test("sign-in button: md:py-1.5 desktop padding paired with md:min-h-0", () => {
  // The button has md:py-1.5 to be compact on desktop.
  // It must also have md:min-h-0 or the min-h-[44px] overrides the padding.
  expect(src).toContain("md:py-1.5");
  // Find the className containing md:py-1.5 and verify md:min-h-0 is present
  const match = src.match(/className="[^"]*md:py-1\.5[^"]*"/);
  expect(match).not.toBeNull();
  expect(match![0]).toContain("md:min-h-0");
});

test("profile avatar: md:w-9 md:h-9 desktop sizing paired with md:min-h-0 md:min-w-0", () => {
  // The avatar has md:w-9 md:h-9 to be 36px square on desktop.
  // Without md:min-h-0, the min-h-[44px] makes it non-square (44px × 36px).
  const match = src.match(/className="[^"]*md:w-9 md:h-9[^"]*"/);
  expect(match).not.toBeNull();
  expect(match![0]).toContain("md:min-h-0");
  expect(match![0]).toContain("md:min-w-0");
});

test("Gutenberg quick-search pills include md:min-h-0 for compact desktop pills", () => {
  // Pills styled with text-xs py-1 should be compact on desktop.
  const match = src.match(/className="[^"]*text-xs rounded-full border border-amber-300 px-3 py-1[^"]*"/);
  expect(match).not.toBeNull();
  expect(match![0]).toContain("md:min-h-0");
});

test("popular-books category filter tags include md:min-h-0", () => {
  // Category tag pills with text-xs py-1 should also be compact on desktop.
  const match = src.match(/`[^`]*text-xs rounded-full px-3 py-1 min-h-\[44px\][^`]*`/);
  expect(match).not.toBeNull();
  expect(match![0]).toContain("md:min-h-0");
});
