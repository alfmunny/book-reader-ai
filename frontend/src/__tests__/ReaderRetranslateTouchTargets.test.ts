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

  it("all queue-era translate controls are gone (owner decision, 2026-08-27)", () => {
    // Editorial translations are produced offline; readers translate with
    // their own versions. No enqueue, no retry, no queue polling.
    expect(readerSrc).not.toContain("handleTranslateThisChapter");
    expect(readerSrc).not.toContain("handleTranslateWholeBook");
    expect(readerSrc).not.toContain("handleRetryFailed");
    expect(readerSrc).not.toContain("requestChapterTranslation");
    expect(readerSrc).not.toContain("enqueueBookTranslation");
    expect(readerSrc).not.toContain("retryChapterTranslation");
    expect(readerSrc).not.toContain("getChapterQueueStatus");
  });

  it("the editorial empty state is explicit instead of a dead toggle", () => {
    expect(readerSrc).toContain("No editorial translation for this chapter");
    expect(readerSrc).toContain("editorial-coverage");
  });
});
