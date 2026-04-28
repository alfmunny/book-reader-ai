import { readFileSync } from "fs";
import { join } from "path";

const uploadPageSrc = readFileSync(join(__dirname, "../app/upload/page.tsx"), "utf-8");
const chaptersPageSrc = readFileSync(join(__dirname, "../app/upload/[bookId]/chapters/page.tsx"), "utf-8");

describe("Upload pages — main landmark integrity (WCAG 1.3.6)", () => {
  it("upload/page.tsx must not use <main role=\"status\"> — overrides landmark with live region", () => {
    expect(uploadPageSrc).not.toMatch(/<main\s[^>]*role="status"/);
  });

  it("upload/page.tsx loading state must use div[role=\"status\"] inside main#main-content", () => {
    expect(uploadPageSrc).toMatch(/role="status"\s*aria-label="Loading upload page"/);
    expect(uploadPageSrc).toMatch(/id="main-content"/);
  });

  it("upload/[bookId]/chapters/page.tsx must not use <main role=\"status\">", () => {
    expect(chaptersPageSrc).not.toMatch(/<main\s[^>]*role="status"/);
  });

  it("upload/[bookId]/chapters/page.tsx loading state must use div[role=\"status\"] inside main#main-content", () => {
    expect(chaptersPageSrc).toMatch(/role="status"\s*aria-label="Loading chapters"/);
    expect(chaptersPageSrc).toMatch(/id="main-content"/);
  });
});
