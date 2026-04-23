/**
 * Verifies that admin/books book-level and language-level action buttons
 * meet the 44px touch-target requirement.
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/admin/books/page.tsx"),
  "utf-8"
);

describe("Admin books action buttons touch targets", () => {
  it("+ Translate button has min-h-[44px]", () => {
    expect(src).toMatch(/\+ Translate[\s\S]{0,50}|queueLanguageForBook[\s\S]{0,300}min-h-\[44px\]/);
  });

  it("book Delete button has min-h-[44px]", () => {
    expect(src).toMatch(/Delete.*and all its audio[\s\S]{0,300}min-h-\[44px\]/);
  });

  it("Retranslate all button has min-h-[44px]", () => {
    expect(src).toMatch(/Retranslate all[\s\S]{0,50}|bulkRetranslating[\s\S]{0,500}min-h-\[44px\]/);
  });

  it("Delete all translations button has min-h-[44px]", () => {
    expect(src).toMatch(/Delete all[\s\S]{0,50}|translations.*DELETE[\s\S]{0,400}min-h-\[44px\]/);
  });
});
