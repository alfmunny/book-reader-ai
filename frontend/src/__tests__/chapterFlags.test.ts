/**
 * Chapter-level audit signals. Hints about where to look in a long split, never
 * gates — so the tests care about what each signal catches AND what it leaves
 * alone, since a false positive on every chapter is the same as no signal.
 */
import {
  flagsFor,
  medianLength,
  paragraphsOf,
  numberTitles,
  titlesFromFirstLine,
  stripLeadingOrdinal,
  RUNT_CHARS,
} from "@/lib/chapterFlags";

const keys = (chapter: { title: string; text: string }, median = 0) =>
  flagsFor(chapter, median).map((f) => f.key);

const prose = (n: number) => Array.from({ length: n }, (_, i) => `Paragraph ${i} ${"x".repeat(200)}`).join("\n\n");

// ── paragraphs and median ────────────────────────────────────────────────────

it("splits paragraphs on blank lines and drops empties", () => {
  expect(paragraphsOf("one\n\ntwo\n\n\n\nthree")).toEqual(["one", "two", "three"]);
});

it("treats a single-newline block as one paragraph", () => {
  expect(paragraphsOf("verse line\nsecond line")).toHaveLength(1);
});

it("medianLength is 0 for an empty book", () => {
  expect(medianLength([])).toBe(0);
});

it("medianLength ignores order", () => {
  const mk = (n: number) => ({ title: "t", text: "x".repeat(n) });
  expect(medianLength([mk(900), mk(100), mk(500)])).toBe(500);
});

// ── the signals ──────────────────────────────────────────────────────────────

it("flags a chapter with no title", () => {
  expect(keys({ title: "  ", text: prose(4) })).toContain("No title");
});

it("flags a runt — too short to be a chapter", () => {
  expect(keys({ title: "III", text: "A gardenhouse." })).toContain("Runt");
});

it("flags a single-paragraph chapter even when it is long", () => {
  expect(keys({ title: "One block", text: "y".repeat(RUNT_CHARS * 3) })).toContain("Runt");
});

it("does not flag an ordinary chapter", () => {
  expect(keys({ title: "Nacht", text: prose(6) }, 1200)).toEqual([]);
});

it("flags an oversized chapter — two that failed to separate", () => {
  expect(keys({ title: "Huge", text: "z".repeat(5000) }, 1000)).toContain("Oversized");
});

it("does not flag oversized when there is no median to compare against", () => {
  expect(keys({ title: "Huge", text: prose(20) }, 0)).not.toContain("Oversized");
});

it("flags collapsed drama — an all-caps cue buried in a long paragraph", () => {
  const collapsed =
    "Zeche lustiger Gesellen in Auerbachs Keller, and the scene runs on at length here. " +
    "x".repeat(260) +
    "\n  FROSCH. Will keiner trinken?";
  expect(keys({ title: "Auerbachs Keller", text: collapsed + "\n\n" + prose(3) })).toContain("Shouting");
});

it("leaves properly split drama alone", () => {
  const split = "FROSCH. Will keiner trinken?\n\nBRANDER. Das liegt an dir.\n\n" + prose(3);
  expect(keys({ title: "Auerbachs Keller", text: split })).not.toContain("Shouting");
});

it("does not mistake a short all-caps line for a collapse", () => {
  expect(keys({ title: "T", text: "short\n  ANNA.\n\n" + prose(3) })).not.toContain("Shouting");
});

it("carries a reason with every flag", () => {
  for (const flag of flagsFor({ title: "", text: "tiny" }, 1000)) {
    expect(flag.detail.length).toBeGreaterThan(20);
  }
});

// ── title tools ──────────────────────────────────────────────────────────────

it("strips a leading ordinal in several shapes", () => {
  expect(stripLeadingOrdinal("Chapter IV. Nacht")).toBe("Nacht");
  expect(stripLeadingOrdinal("3 — Vor dem Tor")).toBe("Vor dem Tor");
  expect(stripLeadingOrdinal("Kapitel 2: Studierzimmer")).toBe("Studierzimmer");
});

it("leaves a title with no ordinal alone", () => {
  expect(stripLeadingOrdinal("Zueignung")).toBe("Zueignung");
});

it("numbers chapters while keeping their names", () => {
  const chs = [{ title: "Zueignung", text: "" }, { title: "Nacht", text: "" }];
  expect(numberTitles(chs)).toEqual(["1. Zueignung", "2. Nacht"]);
});

it("numbering twice does not stack ordinals", () => {
  let chs = [{ title: "Zueignung", text: "" }, { title: "Nacht", text: "" }];
  chs = numberTitles(chs).map((title) => ({ title, text: "" }));
  expect(numberTitles(chs)).toEqual(["1. Zueignung", "2. Nacht"]);
});

it("numbers an untitled chapter with a bare ordinal", () => {
  expect(numberTitles([{ title: "", text: "" }])).toEqual(["1."]);
});

it("fills only empty titles from the first line", () => {
  const chs = [
    { title: "Kept", text: "Ignored first line" },
    { title: "", text: "Ihr naht euch wieder\nsecond line" },
  ];
  expect(titlesFromFirstLine(chs)).toEqual(["Kept", "Ihr naht euch wieder"]);
});

it("skips blank leading lines when taking a first line", () => {
  expect(titlesFromFirstLine([{ title: "", text: "\n\n  Real first line" }])).toEqual(["Real first line"]);
});

it("truncates a very long first line", () => {
  const long = "w".repeat(200);
  expect(titlesFromFirstLine([{ title: "", text: long }], 20)[0]).toHaveLength(20);
});
