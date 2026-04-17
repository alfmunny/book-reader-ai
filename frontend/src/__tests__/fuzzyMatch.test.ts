/**
 * Tests for the admin books filter. The matcher has to handle:
 *   - diacritics (Faust/Goethe have ö, ü)
 *   - case insensitive
 *   - substring hits (the common case, fastest)
 *   - subsequence hits ("wap" → "War and Peace")
 *   - empty query means "everything matches"
 */

import { fuzzyMatch, fuzzyMatchAny } from "@/lib/fuzzyMatch";

describe("fuzzyMatch", () => {
  it("matches substring case-insensitively", () => {
    expect(fuzzyMatch("faust", "Faust — Der Tragödie erster Teil")).toBe(true);
    expect(fuzzyMatch("FAUST", "Faust")).toBe(true);
  });

  it("strips combining diacritics so plain ascii matches accented text", () => {
    // ä/ö/ü decompose to a+combining-umlaut / o+combining-umlaut etc.,
    // so stripping marks turns the accented char into the plain one.
    expect(fuzzyMatch("tragodie", "Tragödie")).toBe(true);
    expect(fuzzyMatch("uber", "Über")).toBe(true);
    // And accented queries still match accented targets.
    expect(fuzzyMatch("ödi", "Tragödie")).toBe(true);
  });

  it("matches subsequences when substring fails", () => {
    expect(fuzzyMatch("wap", "War and Peace")).toBe(true);
    expect(fuzzyMatch("fst", "Faust")).toBe(true);
  });

  it("rejects when no subsequence match", () => {
    expect(fuzzyMatch("xyz", "Faust")).toBe(false);
    expect(fuzzyMatch("peacewar", "War and Peace")).toBe(false);
  });

  it("treats empty query as a pass", () => {
    expect(fuzzyMatch("", "Faust")).toBe(true);
    expect(fuzzyMatch("   ", "Faust")).toBe(true);
  });
});

describe("fuzzyMatchAny", () => {
  it("matches if any of the target fields matches", () => {
    expect(fuzzyMatchAny("goethe", ["Faust", "Johann Wolfgang von Goethe", 2229])).toBe(true);
  });

  it("matches against numeric book IDs", () => {
    expect(fuzzyMatchAny("2229", ["Faust", "Goethe", 2229])).toBe(true);
  });

  it("skips null/undefined fields without crashing", () => {
    expect(fuzzyMatchAny("faust", [null, undefined, "Faust"])).toBe(true);
    expect(fuzzyMatchAny("zzz", [null, undefined])).toBe(false);
  });

  it("returns true on empty query (doesn't filter anything out)", () => {
    expect(fuzzyMatchAny("", ["Faust"])).toBe(true);
  });
});
