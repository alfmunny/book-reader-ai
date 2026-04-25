/**
 * Static assertions: WordActionDrawer focus management + aria-hidden + role=status
 * and DefinitionSheet focus management.
 * Closes #1098
 */
import fs from "fs";
import path from "path";

const wordDrawer = fs.readFileSync(
  path.join(process.cwd(), "src/components/WordActionDrawer.tsx"),
  "utf8",
);

const vocabPage = fs.readFileSync(
  path.join(process.cwd(), "src/app/vocabulary/page.tsx"),
  "utf8",
);

describe("WordActionDrawer aria + focus", () => {
  it("backdrop div has aria-hidden=true", () => {
    expect(wordDrawer).toMatch(/"fixed inset-0 z-40 bg-black\/10"[^>]*aria-hidden="true"|aria-hidden="true"[^>]*"fixed inset-0 z-40 bg-black\/10"/);
  });

  it("has tabIndex={-1} on dialog div for focus management", () => {
    expect(wordDrawer).toContain("tabIndex={-1}");
  });

  it("focuses dialog on mount via useEffect", () => {
    // Look for a useEffect that calls dialogRef.current?.focus()
    expect(wordDrawer).toMatch(/drawerRef\.current\?\.focus\(\)|drawerRef\.current\.focus\(\)/);
  });

  it("loading state has role=status with aria-label", () => {
    // Loading block should have role=status
    expect(wordDrawer).toMatch(/role="status"[^>]*aria-label="Looking up word"|aria-label="Looking up word"[^>]*role="status"/);
  });
});

describe("DefinitionSheet (vocabulary/page.tsx) focus", () => {
  it("focuses dialog on mount", () => {
    // ref.current?.focus() should appear in a useEffect
    expect(vocabPage).toMatch(/ref\.current\?\.focus\(\)/);
  });

  it("has tabIndex={-1} on the dialog div", () => {
    expect(vocabPage).toContain("tabIndex={-1}");
  });
});
