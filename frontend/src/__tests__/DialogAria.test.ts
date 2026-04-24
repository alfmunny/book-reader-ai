/**
 * Static assertions: dialog ARIA attributes on DefinitionSheet and AuthPromptModal
 * Closes #1087
 */
import fs from "fs";
import path from "path";

const vocabPage = fs.readFileSync(
  path.join(process.cwd(), "src/app/vocabulary/page.tsx"),
  "utf8",
);

const authModal = fs.readFileSync(
  path.join(process.cwd(), "src/components/AuthPromptModal.tsx"),
  "utf8",
);

describe("DialogAria", () => {
  it("vocabulary DefinitionSheet panel has role=dialog", () => {
    expect(vocabPage).toContain('role="dialog"');
  });

  it("vocabulary DefinitionSheet panel has aria-modal=true", () => {
    expect(vocabPage).toContain('aria-modal="true"');
  });

  it("vocabulary DefinitionSheet panel has aria-label for word definition", () => {
    expect(vocabPage).toContain('aria-label="Word definition"');
  });

  it("vocabulary DefinitionSheet backdrop has aria-hidden=true", () => {
    expect(vocabPage).toContain('"fixed inset-0 z-40 bg-black/10"');
    // The backdrop div should have aria-hidden
    expect(vocabPage).toMatch(/"fixed inset-0 z-40 bg-black\/10"[^>]*aria-hidden="true"|aria-hidden="true"[^>]*"fixed inset-0 z-40 bg-black\/10"/);
  });

  it("AuthPromptModal backdrop has aria-hidden=true", () => {
    // The backdrop div (absolute inset-0 bg-black/40) should have aria-hidden
    expect(authModal).toMatch(/aria-hidden="true"[^>]*"absolute inset-0 bg-black\/40"|"absolute inset-0 bg-black\/40"[^>]*aria-hidden="true"/);
  });
});
