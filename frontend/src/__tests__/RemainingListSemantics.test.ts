import { readFileSync } from "fs";
import { join } from "path";

const profile = readFileSync(join(__dirname, "../app/(shell)/profile/page.tsx"), "utf-8");
const deckDetail = readFileSync(join(__dirname, "../app/(shell)/decks/[deckId]/page.tsx"), "utf-8");
const notesBook = readFileSync(join(__dirname, "../app/(shell)/notes/[bookId]/page.tsx"), "utf-8");
const queueTab = readFileSync(join(__dirname, "../components/QueueTab.tsx"), "utf-8");
const seedPopular = readFileSync(join(__dirname, "../components/SeedPopularButton.tsx"), "utf-8");

describe("remaining list semantics (WCAG 1.3.1)", () => {
  describe("profile/page.tsx", () => {
    it("study decks list has role=\"list\"", () => {
      expect(profile).toMatch(/<ul[^>]*role="list"[^>]*aria-label="Study decks"|<ul[^>]*aria-label="Study decks"[^>]*role="list"/);
    });
  });

  describe("decks/[deckId]/page.tsx", () => {
    it("deck members list has role=\"list\"", () => {
      expect(deckDetail).toMatch(/<ul[^>]*role="list"[^>]*aria-label="Deck words"|<ul[^>]*aria-label="Deck words"[^>]*role="list"/);
    });
    it("available words picker list has role=\"list\"", () => {
      expect(deckDetail).toMatch(/<ul[^>]*role="list"[^>]*aria-label="Available words"|<ul[^>]*aria-label="Available words"[^>]*role="list"/);
    });
  });

  describe("notes/[bookId]/page.tsx", () => {
    it("vocab list in all-view has role=\"list\"", () => {
      const matches = (notesBook.match(/<ul[^>]*role="list"[^>]*list-none|<ul[^>]*list-none[^>]*role="list"/g) || []).length;
      expect(matches).toBeGreaterThanOrEqual(2);
    });
  });

  describe("components/QueueTab.tsx", () => {
    it("activity log list has role=\"list\"", () => {
      const allUls = queueTab.match(/<ul [^>]*>/g) || [];
      const withRole = allUls.filter(u => u.includes('role="list"'));
      expect(withRole.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("components/SeedPopularButton.tsx", () => {
    it("seed events log list has role=\"list\"", () => {
      expect(seedPopular).toMatch(/<ul[^>]*role="list"/);
    });
  });
});
