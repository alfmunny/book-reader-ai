/**
 * Source-level tests verifying that pure-navigation buttons have been replaced
 * with semantic Link elements in upload, flashcards, and reader error-state pages
 * (closes #2453).
 */
import * as fs from "fs";
import * as path from "path";

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(__dirname, "../app", rel), "utf8");
}

const flashcardsSrc = readSrc("vocabulary/flashcards/page.tsx");
const uploadSrc = readSrc("upload/page.tsx");
const uploadChaptersSrc = readSrc("upload/[bookId]/chapters/page.tsx");
const readerSrc = readSrc("reader/[bookId]/page.tsx");

describe("flashcards page nav links (closes #2453)", () => {
  it("back button uses href=/vocabulary not router.push", () => {
    expect(flashcardsSrc).not.toMatch(/<button[^>]*onClick[^>]*router\.push\(["']\/vocabulary["']\)/);
    expect(flashcardsSrc).toMatch(/href=["']\/vocabulary["']/);
  });

  it("Back to Vocabulary CTA uses href=/vocabulary not router.push", () => {
    expect(flashcardsSrc).not.toMatch(/onClick[^>]*router\.push\(["']\/vocabulary["']\)[\s\S]{0,200}Back to Vocabulary/);
    expect(flashcardsSrc).toMatch(/href=["']\/vocabulary["'][\s\S]{0,400}Back to Vocabulary/);
  });
});

describe("upload page nav links (closes #2453)", () => {
  it("Sign in button uses href not router.push", () => {
    expect(uploadSrc).not.toMatch(/<button[^>]*onClick[^>]*router\.push\(["']\/login["']\)/);
    expect(uploadSrc).toMatch(/href=["']\/login["']/);
  });

  it("Back button uses href=/ not router.push", () => {
    expect(uploadSrc).not.toMatch(/<button[^>]*onClick[^>]*router\.push\(["']\/["']\)/);
    expect(uploadSrc).toMatch(/href=["']\/["']/);
  });
});

describe("upload chapters page nav links (closes #2453)", () => {
  it("Try another file button uses href=/upload not router.push", () => {
    expect(uploadChaptersSrc).not.toMatch(/<button[^>]*onClick.*router\.push.*\/upload/);
    expect(uploadChaptersSrc).toMatch(/href=["']\/upload["']/);
  });
});

describe("reader page error-state nav links (closes #2453)", () => {
  it("Back to library error-state button uses href=/ not router.push", () => {
    expect(readerSrc).not.toMatch(/Back to library[\s\S]{0,100}router\.push\(["']\/["']\)/);
    expect(readerSrc).toMatch(/href=["']\/["'][\s\S]{0,400}Back to library/);
  });
});
