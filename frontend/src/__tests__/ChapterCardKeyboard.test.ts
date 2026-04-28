import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/upload/[bookId]/chapters/page.tsx"),
  "utf-8"
);

describe("Chapter editor cards — keyboard accessibility (WCAG 2.1.1)", () => {
  it("chapter card div must have tabIndex so keyboard users can focus it", () => {
    expect(src).toMatch(/tabIndex=\{0\}/);
  });

  it("chapter card div must have role=\"button\" to expose it as interactive", () => {
    expect(src).toMatch(/role="button"/);
  });

  it("chapter card div must have onKeyDown to activate on Enter/Space", () => {
    expect(src).toMatch(/onKeyDown/);
  });

  it("chapter card div must have aria-label with chapter info", () => {
    expect(src).toMatch(/aria-label=\{/);
  });
});
