/**
 * Static assertion: SentenceReader note-dot button must have a unique
 * aria-label including sentence text (closes #1325, WCAG 2.4.6).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/SentenceReader.tsx"),
  "utf8"
);

describe("SentenceReader Toggle note button has unique aria-label (closes #1325)", () => {
  it("note dot button aria-label includes seg.text", () => {
    expect(src).toMatch(/aria-label=\{`Toggle note for: \$\{seg\.text\.slice/);
  });

  it("does not use generic static aria-label Toggle note", () => {
    expect(src).not.toContain('aria-label="Toggle note"');
  });
});
