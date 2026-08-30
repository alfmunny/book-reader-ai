import { readFileSync } from "fs";
import { join } from "path";

const users = readFileSync(join(__dirname, "../app/(shell)/admin/users/page.tsx"), "utf-8");
const audio = readFileSync(join(__dirname, "../app/(shell)/admin/audio/page.tsx"), "utf-8");
const books = readFileSync(join(__dirname, "../app/(shell)/admin/books/page.tsx"), "utf-8");

describe("admin page list semantics (WCAG 1.3.1)", () => {
  describe("(shell)/admin/users/page.tsx", () => {
    it("users list uses <ul role=\"list\">", () => {
      expect(users).toMatch(/<ul role="list" aria-label="Users"/);
    });
    it("user items use <li>", () => {
      expect(users).toMatch(/<li key=\{u\.id\}/);
    });
  });

  describe("(shell)/admin/audio/page.tsx", () => {
    it("audio list uses <ul role=\"list\">", () => {
      expect(audio).toMatch(/<ul role="list" aria-label="Audio files"/);
    });
    it("audio items use <li>", () => {
      expect(audio).toMatch(/<li key=\{i\}/);
    });
  });

  describe("(shell)/admin/books/page.tsx", () => {
    it("books list uses <ul role=\"list\">", () => {
      expect(books).toMatch(/<ul role="list" aria-label="Books"/);
    });
    it("book items use <li>", () => {
      expect(books).toMatch(/<li key=\{b\.id\}/);
    });
  });
});
