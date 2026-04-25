import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/SentenceReader.tsx"),
  "utf8",
);

describe("parallel translation line-height (closes #1385)", () => {
  it("translation paragraph in parallel mode does not use leading-relaxed", () => {
    // data-translation="true" marks the translation column in parallel mode.
    // The paragraph inside must not have leading-relaxed so it matches the
    // source text line-height and stanzas align vertically.
    const match = src.match(
      /data-translation="true"[\s\S]{0,500}?<p className="[^"]*leading-relaxed[^"]*"/,
    );
    expect(match).toBeNull();
  });
});
