import * as fs from "fs";
import * as path from "path";

const annotationsSrc = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationsSidebar.tsx"),
  "utf-8",
);

const insightChatSrc = fs.readFileSync(
  path.join(__dirname, "../components/InsightChat.tsx"),
  "utf-8",
);

describe("AnnotationsSidebar toggle button aria-expanded", () => {
  it("toggle button has aria-expanded attribute", () => {
    expect(annotationsSrc).toContain("aria-expanded={open}");
  });

  it("toggle button has a stable aria-label", () => {
    expect(annotationsSrc).toContain('aria-label="Toggle notes panel"');
  });
});

describe("InsightChat context toggle button aria-expanded", () => {
  it("primary context toggle has aria-expanded", () => {
    expect(insightChatSrc).toContain("aria-expanded={expanded}");
  });

  it("context toggle uses stable aria-label instead of dynamic one", () => {
    expect(insightChatSrc).toContain('aria-label="Toggle context"');
    expect(insightChatSrc).not.toContain('"Collapse context"');
    expect(insightChatSrc).not.toContain('"Expand context"');
  });
});
