/**
 * Static assertions: animate-pulse/bounce decorative indicators have aria-hidden="true";
 * InsightChat typing indicator container has role="status" + aria-label. Closes #1226.
 */
import fs from "fs";
import path from "path";

const readerPage = fs.readFileSync(
  path.join(process.cwd(), "src/app/reader/[bookId]/page.tsx"),
  "utf8",
);

const insightChat = fs.readFileSync(
  path.join(process.cwd(), "src/components/InsightChat.tsx"),
  "utf8",
);

describe("Decorative animate-pulse dots in reader page", () => {
  it("translation queued banner dot has aria-hidden=true", () => {
    // The sky-blue pulse dot beside the 'Translation queued' text is decorative
    expect(readerPage).toMatch(
      /bg-sky-500[^>]*animate-pulse[^>]*aria-hidden="true"|animate-pulse[^>]*bg-sky-500[^>]*aria-hidden="true"|aria-hidden="true"[^>]*bg-sky-500[^>]*animate-pulse/
    );
  });

  it("translation progress dot has aria-hidden=true", () => {
    // The amber pulse dot beside 'X / Y chapters translated' text is decorative
    expect(readerPage).toMatch(
      /bg-amber-500[^>]*animate-pulse[^>]*aria-hidden="true"|animate-pulse[^>]*bg-amber-500[^>]*aria-hidden="true"|animate-pulse[^>]*shrink-0[^>]*aria-hidden="true"|aria-hidden="true"[^>]*animate-pulse[^>]*shrink-0/
    );
  });
});

describe("InsightChat typing indicator accessibility", () => {
  it("typing indicator container has role=status", () => {
    expect(insightChat).toMatch(/role="status"/);
  });

  it("typing indicator container has aria-label for AI typing", () => {
    expect(insightChat).toMatch(/aria-label="AI is typing"/);
  });

  it("typing indicator bounce dots have aria-hidden=true", () => {
    // The three animate-bounce dots are purely visual — aria-hidden keeps them silent
    expect(insightChat).toMatch(/animate-bounce[^>]*aria-hidden="true"|aria-hidden="true"[^>]*animate-bounce/);
  });
});
