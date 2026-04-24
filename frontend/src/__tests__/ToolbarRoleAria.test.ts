import * as fs from "fs";
import * as path from "path";

describe("Floating action bars have role=\"toolbar\" (closes #1050)", () => {
  it("SelectionToolbar container has role=\"toolbar\"", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../components/SelectionToolbar.tsx"),
      "utf8",
    );
    expect(src).toMatch(/role="toolbar"/);
  });

  it("SelectionToolbar container has aria-label", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../components/SelectionToolbar.tsx"),
      "utf8",
    );
    expect(src).toMatch(/aria-label="[^"]+"/);
  });

  it("SentenceActionPopup container has role=\"toolbar\"", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../components/SentenceActionPopup.tsx"),
      "utf8",
    );
    expect(src).toMatch(/role="toolbar"/);
  });

  it("SentenceActionPopup container has aria-label", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../components/SentenceActionPopup.tsx"),
      "utf8",
    );
    expect(src).toMatch(/aria-label="[^"]+"/);
  });
});
