/**
 * Regression test: keyboard shortcuts panel closes on click-outside (closes #2379).
 *
 * The shortcuts panel opened via "?" had no click-outside handler — clicking on the
 * reading text left it pinned open. Fix adds a mousedown listener on the document
 * that calls setShowShortcuts(false) when the click target is outside the panel
 * container, mirroring the TypographyPanel pattern.
 */
import * as fs from "fs";
import * as path from "path";

const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Reader shortcuts panel click-outside (closes #2379)", () => {
  it("shortcuts panel container has a ref", () => {
    // The container div wrapping the shortcuts button+panel must have a ref
    // so the mousedown handler can call .contains() on it.
    const idx = readerSrc.indexOf("shortcuts-panel");
    expect(idx).toBeGreaterThan(-1);
    // Look for a ref on the parent container — search up to 300 chars before the panel id
    const block = readerSrc.slice(Math.max(0, idx - 300), idx + 50);
    expect(block).toMatch(/ref=\{/);
  });

  it("shortcuts container mousedown handler calls setShowShortcuts(false)", () => {
    // The click-outside effect must listen for mousedown and call setShowShortcuts(false).
    // Look for both patterns in a window surrounding the first setShowShortcuts(false).
    const handlerIdx = readerSrc.indexOf("setShowShortcuts(false)");
    expect(handlerIdx).toBeGreaterThan(-1);
    // Search 400 chars before and 300 chars after (mousedown is registered after the handler body)
    const block = readerSrc.slice(Math.max(0, handlerIdx - 400), handlerIdx + 300);
    expect(block).toMatch(/mousedown/);
  });

  it("shortcuts container useEffect depends on showShortcuts", () => {
    // The effect must be re-armed when showShortcuts changes.
    // Find the mousedown block near setShowShortcuts(false) and confirm showShortcuts is in deps.
    const handlerIdx = readerSrc.indexOf("setShowShortcuts(false)");
    const block = readerSrc.slice(Math.max(0, handlerIdx - 50), handlerIdx + 400);
    expect(block).toMatch(/showShortcuts/);
  });
});
