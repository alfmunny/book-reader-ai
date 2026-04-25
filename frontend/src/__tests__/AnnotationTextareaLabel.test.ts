/**
 * Static assertions: AnnotationToolbar textarea has accessible label
 * Closes #1100
 */
import fs from "fs";
import path from "path";

const toolbar = fs.readFileSync(
  path.join(process.cwd(), "src/components/AnnotationToolbar.tsx"),
  "utf8",
);

describe("AnnotationToolbar Note textarea label", () => {
  it("textarea has id=annotation-note", () => {
    expect(toolbar).toMatch(/<textarea[^>]*id="annotation-note"|id="annotation-note"[\s\S]*<textarea/);
    expect(toolbar).toContain('id="annotation-note"');
  });

  it("has a <label> with htmlFor pointing to the textarea", () => {
    expect(toolbar).toMatch(/<label[^>]*htmlFor="annotation-note"/);
  });

  it("removed the bare <p>Note</p> in favor of the label", () => {
    // The old pattern was <p>Note <span>(optional)</span></p>
    // After fix: <label htmlFor="annotation-note">Note <span>(optional)</span></label>
    expect(toolbar).not.toMatch(/<p[^>]*>Note <span/);
  });
});
