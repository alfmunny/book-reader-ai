/**
 * Regression test for #1329: QueueTab chain reorder buttons must use unique
 * aria-labels that include the model name, not static "Move up" / "Move down"
 * / "Remove from chain" which repeat identically for every chain item.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/QueueTab.tsx"),
  "utf8",
);

describe("QueueTab chain button unique aria-labels (closes #1329)", () => {
  it('does not use static aria-label="Move up"', () => {
    expect(src).not.toContain('aria-label="Move up"');
  });

  it('does not use static aria-label="Move down"', () => {
    expect(src).not.toContain('aria-label="Move down"');
  });

  it('does not use static aria-label="Remove from chain"', () => {
    expect(src).not.toContain('aria-label="Remove from chain"');
  });

  it("Move up button uses labelForModel(m) in its aria-label", () => {
    expect(src).toMatch(
      /aria-label=\{`Move \$\{labelForModel\(m\)\} up`\}/,
    );
  });

  it("Move down button uses labelForModel(m) in its aria-label", () => {
    expect(src).toMatch(
      /aria-label=\{`Move \$\{labelForModel\(m\)\} down`\}/,
    );
  });

  it("Remove button uses labelForModel(m) in its aria-label", () => {
    expect(src).toMatch(
      /aria-label=\{`Remove \$\{labelForModel\(m\)\} from chain`\}/,
    );
  });
});
