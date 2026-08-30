import { readFileSync } from "fs";
import { join } from "path";

const vocab = readFileSync(join(__dirname, "../app/(shell)/vocabulary/page.tsx"), "utf-8");

describe("VocabularyPage DefinitionSheet accessibility (WCAG 2.1.1)", () => {
  it("DefinitionSheet imports CloseIcon", () => {
    expect(vocab).toMatch(/CloseIcon/);
  });

  it("DefinitionSheet has a close button with aria-label", () => {
    expect(vocab).toMatch(/aria-label="Close definition"/);
  });

  it("close button uses CloseIcon", () => {
    const closeButtonBlock = vocab.match(/aria-label="Close definition"[\s\S]{0,450}CloseIcon|CloseIcon[\s\S]{0,450}aria-label="Close definition"/);
    expect(closeButtonBlock).not.toBeNull();
  });
});
