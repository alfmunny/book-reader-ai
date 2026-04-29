import * as fs from "fs";
import * as path from "path";

const sentencePopup = fs.readFileSync(
  path.join(__dirname, "../components/SentenceActionPopup.tsx"),
  "utf8"
);
const wordDrawer = fs.readFileSync(
  path.join(__dirname, "../components/WordActionDrawer.tsx"),
  "utf8"
);
const queueTab = fs.readFileSync(
  path.join(__dirname, "../components/QueueTab.tsx"),
  "utf8"
);
const readerPage = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("SentenceActionPopup focus rings (closes #2176)", () => {
  it("Read button has focus-visible ring with stone-800 offset (dark bg)", () => {
    const idx = sentencePopup.indexOf("onRead()");
    expect(idx).toBeGreaterThan(-1);
    const window = sentencePopup.slice(idx, idx + 450);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("ring-offset-stone-800");
  });

  it("Note button has focus-visible ring with stone-800 offset", () => {
    const idx = sentencePopup.indexOf("onNote()");
    expect(idx).toBeGreaterThan(-1);
    const window = sentencePopup.slice(idx, idx + 450);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("ring-offset-stone-800");
  });
});

describe("WordActionDrawer focus rings (closes #2176)", () => {
  it("Close button has focus-visible ring", () => {
    const idx = wordDrawer.indexOf("Close word lookup");
    expect(idx).toBeGreaterThan(-1);
    const window = wordDrawer.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Read sentence button has focus-visible ring", () => {
    const idx = wordDrawer.indexOf("onReadSentence(action.sentenceText");
    expect(idx).toBeGreaterThan(-1);
    const window = wordDrawer.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Save word button has focus-visible ring", () => {
    const idx = wordDrawer.indexOf("onSaveWord(action.word");
    expect(idx).toBeGreaterThan(-1);
    const window = wordDrawer.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("QueueTab focus rings (closes #2176)", () => {
  it("Confirm dialog Confirm button has focus-visible ring", () => {
    // Skip the dialog div's aria-label; find the button's aria-label (2nd occurrence)
    const first = queueTab.indexOf("aria-label=\"Confirm action\"");
    const idx = queueTab.indexOf("aria-label=\"Confirm action\"", first + 1);
    expect(idx).toBeGreaterThan(-1);
    const window = queueTab.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Confirm dialog Cancel button has focus-visible ring", () => {
    const idx = queueTab.indexOf("aria-label=\"Cancel action\"");
    expect(idx).toBeGreaterThan(-1);
    const window = queueTab.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Stop worker button has focus-visible ring", () => {
    const idx = queueTab.indexOf("onClick={stopWorker}");
    expect(idx).toBeGreaterThan(-1);
    const window = queueTab.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-red-400");
  });

  it("Queue items retry button has focus-visible ring", () => {
    const idx = queueTab.indexOf("retry(it)");
    expect(idx).toBeGreaterThan(-1);
    const window = queueTab.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Queue items delete button has focus-visible ring (red)", () => {
    const idx = queueTab.indexOf("remove(it)");
    expect(idx).toBeGreaterThan(-1);
    const window = queueTab.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-red-400");
  });
});

describe("Reader page focus rings (closes #2176)", () => {
  it("Library back button has focus-visible ring", () => {
    const idx = readerPage.indexOf('router.push("/")');
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Dismiss banner button has focus-visible ring", () => {
    const idx = readerPage.indexOf("setGeminiReminderVisible(false)");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Typography settings button (header) has focus-visible ring", () => {
    const idx = readerPage.indexOf("aria-label=\"Typography settings\"");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Focus mode toggle button has focus-visible ring", () => {
    const idx = readerPage.indexOf("aria-label=\"Focus mode\"");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});
