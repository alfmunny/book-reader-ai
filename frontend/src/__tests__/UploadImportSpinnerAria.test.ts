/**
 * Static assertions: upload confirm spinner has aria-hidden;
 * import stage icons have aria-hidden and sr-only status text. Closes #1235.
 */
import fs from "fs";
import path from "path";

const uploadChaptersPage = fs.readFileSync(
  path.join(process.cwd(), "src/app/upload/[bookId]/chapters/page.tsx"),
  "utf8",
);

const importPage = fs.readFileSync(
  path.join(process.cwd(), "src/app/import/[bookId]/page.tsx"),
  "utf8",
);

describe("Upload chapters confirm button spinner", () => {
  it("animate-spin span inside confirm button has aria-hidden=true", () => {
    expect(uploadChaptersPage).toMatch(
      /animate-spin[^>]*aria-hidden="true"|aria-hidden="true"[^>]*animate-spin/
    );
  });
});

describe("Import stage icon accessibility", () => {
  it("icon wrapper span has aria-hidden=true", () => {
    // The span wrapping CheckCircle/RetryIcon/AlertCircle/CircleDot is decorative
    expect(importPage).toMatch(/aria-hidden="true"/);
  });

  it("stage has sr-only status text for screen readers", () => {
    // Status (done/active/error/pending) must be announced, not just the label
    expect(importPage).toMatch(/sr-only/);
  });
});
