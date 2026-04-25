/**
 * Static assertions: "Looking up" spinner containers have role=status and
 * spinner spans have aria-hidden=true in WordLookup, VocabWordTooltip, and
 * vocabulary page. Closes #1232.
 */
import fs from "fs";
import path from "path";

const wordLookup = fs.readFileSync(
  path.join(process.cwd(), "src/components/WordLookup.tsx"),
  "utf8",
);

const vocabTooltip = fs.readFileSync(
  path.join(process.cwd(), "src/components/VocabWordTooltip.tsx"),
  "utf8",
);

const vocabPage = fs.readFileSync(
  path.join(process.cwd(), "src/app/vocabulary/page.tsx"),
  "utf8",
);

describe("WordLookup loading spinner", () => {
  it("spinner container has role=status", () => {
    expect(wordLookup).toMatch(/role="status"/);
  });

  it("spinner span has aria-hidden=true", () => {
    expect(wordLookup).toMatch(/animate-spin[^>]*aria-hidden="true"|aria-hidden="true"[^>]*animate-spin/);
  });
});

describe("VocabWordTooltip loading spinner", () => {
  it("spinner container has role=status", () => {
    expect(vocabTooltip).toMatch(/role="status"/);
  });

  it("spinner span has aria-hidden=true", () => {
    expect(vocabTooltip).toMatch(/animate-spin[^>]*aria-hidden="true"|aria-hidden="true"[^>]*animate-spin/);
  });
});

describe("Vocabulary page loading spinner", () => {
  it("spinner container has role=status", () => {
    // The "Looking up…" div in the word-detail panel
    expect(vocabPage).toMatch(/role="status"/);
  });

  it("spinner span has aria-hidden=true", () => {
    expect(vocabPage).toMatch(/animate-spin[^>]*aria-hidden="true"|aria-hidden="true"[^>]*animate-spin/);
  });
});
