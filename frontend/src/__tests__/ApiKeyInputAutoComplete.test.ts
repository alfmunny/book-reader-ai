import * as fs from "fs";
import * as path from "path";

const profileSrc = fs.readFileSync(path.join(__dirname, "../app/(shell)/profile/page.tsx"), "utf8");
const queueTabSrc = fs.readFileSync(path.join(__dirname, "../components/QueueTab.tsx"), "utf8");

describe("API key / token inputs have autoComplete=off and focus ring", () => {
  it("profile Gemini API key input has autoComplete=off", () => {
    const idx = profileSrc.indexOf('aria-label="Gemini API key"');
    const window = profileSrc.slice(Math.max(0, idx - 50), idx + 400);
    expect(window).toMatch(/autoComplete="off"/);
  });

  it("profile Obsidian token input has autoComplete=off", () => {
    const idx = profileSrc.indexOf('id="obsidian-token"');
    const window = profileSrc.slice(idx, idx + 300);
    expect(window).toMatch(/autoComplete="off"/);
  });

  it("QueueTab admin Gemini API key input has autoComplete=off", () => {
    const idx = queueTabSrc.indexOf("Gemini API key");
    const window = queueTabSrc.slice(idx, idx + 600);
    expect(window).toMatch(/autoComplete="off"/);
  });

  it("QueueTab admin Gemini API key input has focus:ring-2", () => {
    const idx = queueTabSrc.indexOf("Gemini API key");
    const window = queueTabSrc.slice(idx, idx + 600);
    expect(window).toMatch(/focus:ring-2/);
  });
});
