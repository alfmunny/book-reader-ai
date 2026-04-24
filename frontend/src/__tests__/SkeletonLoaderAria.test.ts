import * as fs from "fs";
import * as path from "path";

const insightSrc = fs.readFileSync(
  path.join(__dirname, "../components/InsightChat.tsx"),
  "utf8",
);
const sentenceSrc = fs.readFileSync(
  path.join(__dirname, "../components/SentenceReader.tsx"),
  "utf8",
);
const chapterSrc = fs.readFileSync(
  path.join(__dirname, "../components/ChapterSummary.tsx"),
  "utf8",
);

describe("Skeleton loaders have accessible role=\"status\" (closes #1064)", () => {
  it("InsightChat skeleton has role=\"status\"", () => {
    expect(insightSrc).toMatch(/role="status"/);
  });

  it("InsightChat skeleton has aria-label for loading state", () => {
    expect(insightSrc).toMatch(/aria-label="[^"]*[Ll]oad/);
  });

  it("SentenceReader translation skeleton has role=\"status\"", () => {
    expect(sentenceSrc).toMatch(/role="status"/);
  });

  it("SentenceReader translation skeleton has aria-label for loading state", () => {
    expect(sentenceSrc).toMatch(/aria-label="[^"]*[Ll]oad/);
  });

  it("ChapterSummary skeleton has role=\"status\"", () => {
    expect(chapterSrc).toMatch(/role="status"/);
  });

  it("ChapterSummary skeleton has aria-label for loading state", () => {
    expect(chapterSrc).toMatch(/aria-label="[^"]*[Ll]oad/);
  });
});
