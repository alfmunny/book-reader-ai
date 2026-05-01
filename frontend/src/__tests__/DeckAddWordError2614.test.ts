/**
 * Regression: /decks/[deckId] handleAdd should surface an error banner
 * when addDeckMember API call fails, not silently roll back.
 * Closes #2614
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Deck detail page — add-word failure UX (#2614)", () => {
  const src = read("src/app/decks/[deckId]/page.tsx");

  it("declares an addMemberErrorMsg state for add failures", () => {
    expect(src).toMatch(/addMemberErrorMsg/);
  });

  it("handleAdd catch block sets an error message (not just silent rollback)", () => {
    const handleAddStart = src.indexOf("const handleAdd");
    expect(handleAddStart).toBeGreaterThan(-1);
    const handleAddEnd = src.indexOf("\n  );", handleAddStart) + 5;
    const handleAddBody = src.slice(handleAddStart, handleAddEnd);
    // Must have a catch that calls setAddMemberErrorMsg, not just silent rollback
    expect(handleAddBody).toMatch(/setAddMemberErrorMsg/);
  });

  it("add failure error banner renders with role=alert", () => {
    // The banner for add errors must use role="alert" for screen readers
    const addErrorBannerMatch = src.match(
      /addMemberErrorMsg[\s\S]{0,200}?role=["']alert["']|role=["']alert["'][\s\S]{0,200}?addMemberErrorMsg/,
    );
    expect(addErrorBannerMatch).not.toBeNull();
  });
});
