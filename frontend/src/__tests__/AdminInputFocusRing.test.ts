import * as fs from "fs";
import * as path from "path";

const adminBooksPath = path.join(__dirname, "../app/(shell)/admin/books/page.tsx");
const adminUploadsPath = path.join(__dirname, "../app/(shell)/admin/uploads/page.tsx");

const booksSrc = fs.readFileSync(adminBooksPath, "utf8");
const uploadsSrc = fs.readFileSync(adminUploadsPath, "utf8");

describe("Admin inputs have focus ring styles (WCAG 2.4.7)", () => {
  it("(shell)/admin/books import ID input has focus:ring-2", () => {
    const idx = booksSrc.indexOf("Gutenberg Book ID to import");
    const window = booksSrc.slice(idx, idx + 500);
    expect(window).toMatch(/focus:ring-2/);
  });

  it("(shell)/admin/books search filter input has focus:ring-2", () => {
    const idx = booksSrc.indexOf("Filter books");
    const window = booksSrc.slice(Math.max(0, idx - 400), idx + 100);
    expect(window).toMatch(/focus:ring-2/);
  });

  it("(shell)/admin/books chapter move input has focus:ring-2", () => {
    const idx = booksSrc.indexOf("Move to chapter number");
    const window = booksSrc.slice(idx, idx + 1200);
    expect(window).toMatch(/focus:ring-2/);
  });

  it("(shell)/admin/uploads user ID filter input has focus:ring-2", () => {
    const idx = uploadsSrc.indexOf("User ID filter");
    const window = uploadsSrc.slice(Math.max(0, idx - 400), idx + 100);
    expect(window).toMatch(/focus:ring-2/);
  });
});
