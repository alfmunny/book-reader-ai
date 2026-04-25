/**
 * Static assertions: reader page loading indicators have correct aria attributes.
 * Closes #1229.
 */
import fs from "fs";
import path from "path";

const readerPage = fs.readFileSync(
  path.join(process.cwd(), "src/app/reader/[bookId]/page.tsx"),
  "utf8",
);

describe("Reader header skeleton aria-hidden", () => {
  it("title skeleton pulse div has aria-hidden=true", () => {
    // The h-4 w-48 animate-pulse placeholder is decorative while the title loads
    expect(readerPage).toMatch(
      /h-4 w-48 bg-amber-200 animate-pulse rounded"[^>]*aria-hidden="true"|aria-hidden="true"[^>]*h-4 w-48 bg-amber-200 animate-pulse/
    );
  });
});

describe("Reader annotations loading spinner accessibility", () => {
  it("annotations spinner container has role=status", () => {
    // The spinner shown while annotationsLoading && annotations.length === 0
    expect(readerPage).toMatch(/annotationsLoading[\s\S]{0,300}role="status"/);
  });

  it("annotations spinner container has aria-label", () => {
    expect(readerPage).toMatch(/aria-label="Loading annotations"/);
  });

  it("annotations spinner span has aria-hidden=true", () => {
    // The visual spin element is decorative once role=status is on the container
    expect(readerPage).toMatch(
      /border-t-amber-700 rounded-full animate-spin"[^/]*aria-hidden="true"|animate-spin[^>]*aria-hidden="true"/
    );
  });
});
