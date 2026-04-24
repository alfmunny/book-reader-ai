import * as fs from "fs";
import * as path from "path";

const authModal = fs.readFileSync(
  path.join(__dirname, "../components/AuthPromptModal.tsx"),
  "utf8"
);

const bookModal = fs.readFileSync(
  path.join(__dirname, "../components/BookDetailModal.tsx"),
  "utf8"
);

describe("Modal components have role=\"dialog\" and aria-modal (closes #1037)", () => {
  it("AuthPromptModal has role=\"dialog\"", () => {
    expect(authModal).toContain('role="dialog"');
  });

  it("AuthPromptModal has aria-modal=\"true\"", () => {
    expect(authModal).toContain('aria-modal="true"');
  });

  it("BookDetailModal has role=\"dialog\"", () => {
    expect(bookModal).toContain('role="dialog"');
  });

  it("BookDetailModal has aria-modal=\"true\"", () => {
    expect(bookModal).toContain('aria-modal="true"');
  });
});
