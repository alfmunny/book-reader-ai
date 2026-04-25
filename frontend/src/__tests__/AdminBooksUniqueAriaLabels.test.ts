/**
 * Static assertions: admin/books/page.tsx must have unique aria-labels on
 * all repeated interactive controls (closes #1322, WCAG 2.4.6).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/admin/books/page.tsx"),
  "utf8"
);

describe("AdminBooks aria-labels are unique per book/language (closes #1322)", () => {
  it("book expand/collapse button includes b.title in aria-label", () => {
    expect(src).toMatch(/aria-label=\{isExpanded \? `Collapse \$\{b\.title\}`/);
  });

  it("language expand/collapse button includes lang in aria-label", () => {
    expect(src).toMatch(/aria-label=\{isLangExpanded \? `Collapse \$\{lang\}/);
  });

  it("Open reader button includes book title", () => {
    expect(src).toMatch(/aria-label=\{`Open reader for \$\{b\.title\}`\}/);
  });

  it("Delete book button includes book title", () => {
    expect(src).toMatch(/aria-label=\{`Delete \$\{b\.title\}`\}/);
  });

  it("Retranslate all button includes lang in aria-label", () => {
    expect(src).toMatch(/aria-label=\{`Retranslate all \$\{lang\}/);
  });

  it("Delete all translations button includes lang in aria-label", () => {
    expect(src).toMatch(/aria-label=\{`Delete all \$\{lang\}/);
  });

  it("does not use generic static aria-label Collapse/Expand for book expand button", () => {
    expect(src).not.toContain('aria-label={isExpanded ? "Collapse" : "Expand"}');
  });

  it("does not use generic static aria-label Collapse/Expand for language expand button", () => {
    expect(src).not.toContain('aria-label={isLangExpanded ? "Collapse" : "Expand"}');
  });

  it("does not use generic static aria-label Open reader", () => {
    expect(src).not.toContain('aria-label="Open reader"');
  });
});
