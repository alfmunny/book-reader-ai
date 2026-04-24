import * as fs from "fs";
import * as path from "path";

const appDir = path.join(__dirname, "../app");

const homeSrc = fs.readFileSync(path.join(appDir, "page.tsx"), "utf8");
const vocabSrc = fs.readFileSync(path.join(appDir, "vocabulary/page.tsx"), "utf8");
const notesSrc = fs.readFileSync(path.join(appDir, "notes/page.tsx"), "utf8");
const decksSrc = fs.readFileSync(path.join(appDir, "decks/page.tsx"), "utf8");
const uploadSrc = fs.readFileSync(path.join(appDir, "upload/page.tsx"), "utf8");
const adminLayoutSrc = fs.readFileSync(path.join(appDir, "admin/layout.tsx"), "utf8");
const adminUploadsSrc = fs.readFileSync(path.join(appDir, "admin/uploads/page.tsx"), "utf8");
const adminBooksSrc = fs.readFileSync(path.join(appDir, "admin/books/page.tsx"), "utf8");
const adminAudioSrc = fs.readFileSync(path.join(appDir, "admin/audio/page.tsx"), "utf8");

describe("Page-level loading states have accessible role=\"status\" (closes #1066)", () => {
  it("home page (page.tsx) has role=\"status\" on loading states", () => {
    expect(homeSrc).toMatch(/role="status"/);
  });

  it("vocabulary page has role=\"status\" on loading state", () => {
    expect(vocabSrc).toMatch(/role="status"/);
  });

  it("notes page has role=\"status\" on loading spinner", () => {
    expect(notesSrc).toMatch(/role="status"/);
  });

  it("decks page has role=\"status\" on loading skeleton", () => {
    expect(decksSrc).toMatch(/role="status"/);
  });

  it("upload page has role=\"status\" on loading states", () => {
    expect(uploadSrc).toMatch(/role="status"/);
  });

  it("admin layout has role=\"status\" on auth-check spinner", () => {
    expect(adminLayoutSrc).toMatch(/role="status"/);
  });

  it("admin/uploads page has role=\"status\" on loading spinner", () => {
    expect(adminUploadsSrc).toMatch(/role="status"/);
  });

  it("admin/books page has role=\"status\" on loading spinner", () => {
    expect(adminBooksSrc).toMatch(/role="status"/);
  });

  it("admin/audio page has role=\"status\" on loading spinner", () => {
    expect(adminAudioSrc).toMatch(/role="status"/);
  });
});
