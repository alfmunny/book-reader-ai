import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("reader page select elements aria-label (closes #969)", () => {
  // #2745 replaced both chapter <select> dropdowns with buttons that open the
  // Contents sidebar. The accessible-name requirement from #969 carries over
  // to the controls that took their place.
  it("both chapter navigation controls have an accessible name", () => {
    // Desktop toolbar and mobile bottom bar. The keyboard shortcut also opens
    // the tab, so match on the labelled controls rather than the tab setter.
    const labels = [...src.matchAll(/aria-label="Table of contents"/g)];
    expect(labels.length).toBe(2);
  });

  it("the contents panel is reachable from the keyboard", () => {
    const idx = src.indexOf('e.key === "t"');
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(idx, idx + 220)).toContain('setSidebarTab("toc")');
  });

  it("no chapter dropdown remains to truncate long titles", () => {
    expect(src).not.toContain('aria-label="Go to chapter"');
    expect(src).not.toContain("goToChapter(Number(e.target.value))");
  });

  it("translation sidebar target language select has id for label association", () => {
    // The select moved into the Editorial card (TranslationSessionPanel)
    const panelSrc = fs.readFileSync(
      path.join(__dirname, "../components/TranslationSessionPanel.tsx"),
      "utf8"
    );
    const idx = panelSrc.indexOf('"reader-trans-lang"');
    expect(idx).toBeGreaterThan(-1);
  });

  it("mobile translation expand panel select has aria-label", () => {
    // The mobile expand panel select has translateExpanded context and setTranslationLang
    const idx = src.indexOf("translateExpanded && translationEnabled");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(idx, idx + 600);
    expect(window).toContain('aria-label="Translation language"');
  });

});
