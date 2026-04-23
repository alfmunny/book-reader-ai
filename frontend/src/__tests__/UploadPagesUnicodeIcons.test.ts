/**
 * Verifies upload and admin uploads pages use SVG icons not Unicode symbols.
 */
import fs from "fs";
import path from "path";

const uploadSrc = fs.readFileSync(
  path.join(__dirname, "../app/upload/page.tsx"),
  "utf-8"
);
const chaptersSrc = fs.readFileSync(
  path.join(__dirname, "../app/upload/[bookId]/chapters/page.tsx"),
  "utf-8"
);
const adminUploadsSrc = fs.readFileSync(
  path.join(__dirname, "../app/admin/uploads/page.tsx"),
  "utf-8"
);

describe("Upload page Unicode icon replacements", () => {
  it("upload page Back button does not use raw ← arrow", () => {
    expect(uploadSrc).not.toMatch(/>\s*←\s*Back/);
  });

  it("upload page imports ArrowLeftIcon", () => {
    expect(uploadSrc).toMatch(/ArrowLeftIcon/);
  });

  it("upload page Back button uses ArrowLeftIcon", () => {
    expect(uploadSrc).toMatch(/ArrowLeftIcon[\s\S]{0,50}Back/);
  });
});

describe("Upload chapters page Unicode icon replacements", () => {
  it("chapters page Back button does not use raw ← arrow", () => {
    expect(chaptersSrc).not.toMatch(/>\s*←\s*Back/);
  });

  it("chapters page imports ArrowLeftIcon", () => {
    expect(chaptersSrc).toMatch(/ArrowLeftIcon/);
  });

  it("chapters page Back button uses ArrowLeftIcon", () => {
    expect(chaptersSrc).toMatch(/ArrowLeftIcon[\s\S]{0,50}Back/);
  });
});

describe("Admin uploads page Unicode icon replacements", () => {
  it("admin uploads Clear filter button does not use raw ✕", () => {
    expect(adminUploadsSrc).not.toMatch(/>\s*✕\s*Clear/);
  });

  it("admin uploads imports CloseIcon", () => {
    expect(adminUploadsSrc).toMatch(/CloseIcon/);
  });

  it("admin uploads Clear filter button uses CloseIcon", () => {
    expect(adminUploadsSrc).toMatch(/CloseIcon[\s\S]{0,100}Clear filter/);
  });
});
