/**
 * Static assertion: /decks/[deckId] page supports manual-deck member management
 * (add/remove words) with proper a11y; smart decks remain read-only.
 * Closes #1191
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Deck detail member management UI", () => {
  const src = read("src/app/decks/[deckId]/page.tsx");

  it("imports addDeckMember and removeDeckMember", () => {
    expect(src).toMatch(/addDeckMember/);
    expect(src).toMatch(/removeDeckMember/);
  });

  it("gates add/remove UI on manual mode", () => {
    expect(src).toMatch(/mode\s*===\s*["']manual["']/);
  });

  it("remove button has aria-label", () => {
    expect(src).toMatch(/aria-label=\{?["'`]Remove [^"'`]+/);
  });

  it("remove button uses 44px touch target", () => {
    expect(src).toMatch(/min-h-\[44px\]/);
  });

  it("add-word button is rendered with PlusIcon", () => {
    expect(src).toMatch(/PlusIcon/);
    expect(src).toMatch(/Add word/i);
  });

  it("picker modal uses role=dialog with aria-modal", () => {
    expect(src).toMatch(/role=["']dialog["']/);
    expect(src).toMatch(/aria-modal=\{?["']?true/);
  });

  it("uses UndoToast for remove flow", () => {
    expect(src).toMatch(/UndoToast/);
  });
});
