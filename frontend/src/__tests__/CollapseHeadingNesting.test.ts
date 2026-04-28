/**
 * Regression test for issue #1804:
 * CollapseHeading nested <h2>/<h3> inside <button> — inverts WAI-ARIA accordion pattern.
 * Fixed by wrapping <button> inside the heading element instead.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/notes/[bookId]/page.tsx"),
  "utf8",
);

describe("CollapseHeading heading nesting (closes #1804)", () => {
  it("heading tag wraps button, not the other way around", () => {
    // The old pattern was <button ...aria-expanded...> ... <Tag ...>label</Tag> </button>
    // The new pattern must be <Tag ...><button ...aria-expanded...>label</button></Tag>
    // Detect old (wrong) pattern: <Tag appearing INSIDE a <button aria-expanded block
    expect(src).not.toMatch(/<button[^>]*aria-expanded[^>]*>[\s\S]{0,400}<Tag\s/);
  });

  it("CollapseHeading renders heading element as outer wrapper", () => {
    // The Tag variable (h2/h3) should be the outermost returned element
    // Check that the component returns <Tag ... > before <button
    expect(src).toMatch(/return\s*\(\s*<Tag/);
  });
});
