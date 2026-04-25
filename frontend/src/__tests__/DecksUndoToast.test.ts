/**
 * Static assertions: decks page uses UndoToast pattern for delete.
 * Closes #1135
 */
import fs from "fs";
import path from "path";

const page = fs.readFileSync(
  path.join(process.cwd(), "src/app/decks/page.tsx"),
  "utf8",
);

describe("Decks page UndoToast", () => {
  it("imports UndoToast component", () => {
    expect(page).toContain('import UndoToast from "@/components/UndoToast"');
  });

  it("uses a toast state (removedDeckToast or similar)", () => {
    expect(page).toMatch(/removedDeckToast|deletedDeckToast/);
  });

  it("renders UndoToast when a deck has been removed", () => {
    expect(page).toMatch(/<UndoToast\b/);
  });

  it("UndoToast onDone calls deleteDeck (actual API delete deferred to toast expiry)", () => {
    // The deleteDeck API call should be inside the UndoToast onDone, not in the click handler
    const idx = page.indexOf("<UndoToast");
    expect(idx).toBeGreaterThan(0);
    const block = page.slice(idx, idx + 800);
    expect(block).toContain("deleteDeck(");
  });
});
