/**
 * The admin "Retranslate chapter" button was a translation-queue leftover:
 * it deleted the cached editorial translation and re-enqueued it online.
 * Removed 2026-08-27 (owner decision) — editorial translations are made
 * offline (local-first, #2624) and readers use translation versions instead.
 */
import * as fs from "fs";
import * as path from "path";

const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("queue-era admin retranslate is gone", () => {
  it("the reader no longer offers the admin Retranslate chapter button", () => {
    expect(readerSrc).not.toContain("Retranslate chapter");
    expect(readerSrc).not.toContain("handleRetranslate");
    expect(readerSrc).not.toContain("deleteTranslationCache");
  });
});
