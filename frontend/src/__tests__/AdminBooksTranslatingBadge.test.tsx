/**
 * Regression test for #1971: admin books "translating" badge must have
 * aria-label="Translating to <lang>" so screen readers don't announce
 * "translating right arrow de".
 */
import React from "react";
import { render, screen } from "@testing-library/react";

const mockAdminFetch = jest.fn();

jest.mock("@/lib/adminFetch", () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/components/SeedPopularButton", () => {
  const Seed = ({ onComplete }: { onComplete: () => void }) => (
    <button onClick={onComplete}>Seed popular</button>
  );
  Seed.displayName = "SeedPopularButton";
  return { __esModule: true, default: Seed };
});

let BooksPage: React.ComponentType;
beforeAll(async () => {
  const mod = await import("@/app/admin/books/page");
  BooksPage = mod.default;
});

beforeEach(() => {
  jest.clearAllMocks();
});

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

const ACTIVE_BOOK = {
  id: 1,
  title: "Faust",
  authors: ["Goethe"],
  languages: ["de"],
  download_count: 50,
  text_length: 20000,
  word_count: 3000,
  translations: {},
  queue: {},
  active: true,
  active_language: "en",
};

test("active translating badge has aria-label announcing 'Translating to <lang>'", async () => {
  mockAdminFetch.mockResolvedValue(ACTIVE_BOOK);
  // First call = GET /admin/books (returns array), subsequent calls can be for settings etc
  mockAdminFetch.mockImplementation((url: string) => {
    if (url === "/admin/books") return Promise.resolve([ACTIVE_BOOK]);
    return Promise.resolve({});
  });

  render(<BooksPage />);
  await flushPromises();

  await screen.findByText("Faust");

  // The translating badge must announce "Translating to en" not "translating right arrow en"
  const badge = screen.getByRole("status", { name: /translating to en/i });
  expect(badge).toBeInTheDocument();
});
