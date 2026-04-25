import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(path.join(__dirname, "../components/BookCard.tsx"), "utf8");

describe("BookCard remove button has unique aria-label per book (closes #1317)", () => {
  it("remove button aria-label includes book.title", () => {
    expect(src).toContain("book.title");
    // The label must be a template literal containing the title, not a static string
    expect(src).toMatch(/aria-label=\{`Remove \$\{book\.title\}/);
  });

  it("does not use generic static aria-label for remove button", () => {
    expect(src).not.toContain('aria-label="Remove from library"');
  });
});
