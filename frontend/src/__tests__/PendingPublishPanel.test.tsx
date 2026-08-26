/**
 * The admin review queue: books an architect session froze that no human has
 * published yet. Publishing is the reversible, outward-facing half of what used
 * to be a single irreversible step.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAdminFetch = jest.fn();
jest.mock("@/lib/adminFetch", () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

import PendingPublishPanel from "@/components/PendingPublishPanel";

const BOOK = {
  id: 2229,
  title: "Faust",
  authors: ["J. W. von Goethe"],
  languages: ["de"],
  frozen_at: "2026-08-26",
  audited_by: "architect",
  splitter: "html_preference",
  chapter_source: "epub",
  chapter_count: 28,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAdminFetch.mockResolvedValue([BOOK]);
});

it("lists a frozen book that is waiting", async () => {
  render(<PendingPublishPanel />);
  expect(await screen.findByText("Faust")).toBeInTheDocument();
  expect(mockAdminFetch).toHaveBeenCalledWith("/admin/books/pending-publish");
});

it("shows what the session decided, so the call can be made from the list", async () => {
  render(<PendingPublishPanel />);
  await screen.findByText("Faust");
  const meta = screen.getByText(/28 chapters/);
  expect(meta).toHaveTextContent("frozen 2026-08-26");
  expect(meta).toHaveTextContent("audited by architect");
});

it("offers a way to read the book before publishing it", async () => {
  render(<PendingPublishPanel />);
  await screen.findByText("Faust");
  expect(screen.getByRole("link", { name: /read it first/i })).toHaveAttribute("href", "/reader/2229");
});

it("adds to the library and drops the row", async () => {
  const user = userEvent.setup();
  render(<PendingPublishPanel />);
  await screen.findByText("Faust");

  mockAdminFetch.mockResolvedValueOnce({ ok: true, published: true });
  await user.click(screen.getByRole("button", { name: /add to library/i }));

  await waitFor(() =>
    expect(mockAdminFetch).toHaveBeenCalledWith("/admin/books/2229/publish", { method: "POST" }),
  );
  await waitFor(() => expect(screen.queryByText("Faust")).not.toBeInTheDocument());
});

it("confirms what just went live rather than going silently empty", async () => {
  const user = userEvent.setup();
  render(<PendingPublishPanel />);
  await screen.findByText("Faust");

  mockAdminFetch.mockResolvedValueOnce({ ok: true });
  await user.click(screen.getByRole("button", { name: /add to library/i }));

  expect(await screen.findByText(/Faust.*is in the library/)).toBeInTheDocument();
});

it("keeps the row when adding fails, and says why", async () => {
  const user = userEvent.setup();
  render(<PendingPublishPanel />);
  await screen.findByText("Faust");

  mockAdminFetch.mockRejectedValueOnce(new Error("Book is not frozen"));
  await user.click(screen.getByRole("button", { name: /add to library/i }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Book is not frozen");
  expect(screen.getByText("Faust")).toBeInTheDocument();
});

it("explains the empty queue instead of showing a blank box", async () => {
  mockAdminFetch.mockResolvedValue([]);
  render(<PendingPublishPanel />);
  expect(await screen.findByText(/Nothing waiting/i)).toBeInTheDocument();
});

it("stays visible when empty — a missing section reads as a missing feature", async () => {
  mockAdminFetch.mockResolvedValue([]);
  render(<PendingPublishPanel />);
  await screen.findByText(/Nothing waiting/i);
  expect(screen.getByRole("heading", { name: /awaiting review/i })).toBeInTheDocument();
});

it("offers a retry when the queue cannot be loaded", async () => {
  const user = userEvent.setup();
  mockAdminFetch.mockRejectedValueOnce(new Error("network down"));
  render(<PendingPublishPanel />);

  expect(await screen.findByRole("alert")).toHaveTextContent("network down");

  mockAdminFetch.mockResolvedValueOnce([BOOK]);
  await user.click(screen.getByRole("button", { name: /retry/i }));
  expect(await screen.findByText("Faust")).toBeInTheDocument();
});

it("counts what is waiting", async () => {
  mockAdminFetch.mockResolvedValue([BOOK, { ...BOOK, id: 84, title: "Frankenstein" }]);
  render(<PendingPublishPanel />);
  await screen.findByText("Frankenstein");
  const heading = screen.getByRole("heading", { name: /awaiting review/i });
  expect(heading.parentElement).toHaveTextContent("2");
});

it("tolerates a malformed response without crashing", async () => {
  mockAdminFetch.mockResolvedValue({ not: "an array" });
  render(<PendingPublishPanel />);
  expect(await screen.findByText(/Nothing waiting/i)).toBeInTheDocument();
});

// ── translation readiness ─────────────────────────────────────────────────────

it("shows how far each translation has got", async () => {
  mockAdminFetch.mockResolvedValue([{
    ...BOOK,
    translations: [{ language: "zh", translated: 11, total: 42, complete: false }],
  }]);
  render(<PendingPublishPanel />);
  expect(await screen.findByText("zh 11/42")).toBeInTheDocument();
});

it("says complete rather than a ratio when a translation is finished", async () => {
  mockAdminFetch.mockResolvedValue([{
    ...BOOK,
    translations: [{ language: "zh", translated: 42, total: 42, complete: true }],
  }]);
  render(<PendingPublishPanel />);
  expect(await screen.findByText("zh complete")).toBeInTheDocument();
});

it("spells out what is missing on hover", async () => {
  mockAdminFetch.mockResolvedValue([{
    ...BOOK,
    translations: [{ language: "zh", translated: 11, total: 42, complete: false }],
  }]);
  render(<PendingPublishPanel />);
  expect(await screen.findByTitle(/31 of 42 chapters still untranslated/)).toBeInTheDocument();
});

it("lists every target language", async () => {
  mockAdminFetch.mockResolvedValue([{
    ...BOOK,
    translations: [
      { language: "de", translated: 1, total: 4, complete: false },
      { language: "zh", translated: 4, total: 4, complete: true },
    ],
  }]);
  render(<PendingPublishPanel />);
  expect(await screen.findByText("de 1/4")).toBeInTheDocument();
  expect(screen.getByText("zh complete")).toBeInTheDocument();
});

it("says so when a book has no translation at all", async () => {
  mockAdminFetch.mockResolvedValue([{ ...BOOK, translations: [] }]);
  render(<PendingPublishPanel />);
  expect(await screen.findByText("not translated")).toBeInTheDocument();
});

it("tolerates a response without the translations field", async () => {
  mockAdminFetch.mockResolvedValue([BOOK]);
  render(<PendingPublishPanel />);
  expect(await screen.findByText("not translated")).toBeInTheDocument();
});

it("still allows adding a part-translated book — informs, does not block", async () => {
  const user = userEvent.setup();
  mockAdminFetch.mockResolvedValue([{
    ...BOOK,
    translations: [{ language: "zh", translated: 1, total: 42, complete: false }],
  }]);
  render(<PendingPublishPanel />);
  await screen.findByText("zh 1/42");

  mockAdminFetch.mockResolvedValueOnce({ ok: true });
  await user.click(screen.getByRole("button", { name: /add to library/i }));
  await waitFor(() =>
    expect(mockAdminFetch).toHaveBeenCalledWith("/admin/books/2229/publish", { method: "POST" }),
  );
});

// ── fixing a bad split without leaving the queue ──────────────────────────────

const CHAPTERS = {
  chapters: [
    { index: 0, title: "Nacht", text: "a\n\nb" },
    { index: 1, title: "Vor dem Tor", text: "c\n\nd" },
  ],
  editable: true,
  blocked_by: {},
  published: false,
};

it("opens the split for review", async () => {
  const user = userEvent.setup();
  render(<PendingPublishPanel />);
  await screen.findByText("Faust");

  mockAdminFetch.mockResolvedValueOnce(CHAPTERS);
  await user.click(screen.getByRole("button", { name: /review split/i }));

  expect(await screen.findByText(/Reviewing the split — Faust/)).toBeInTheDocument();
  expect(mockAdminFetch).toHaveBeenCalledWith("/admin/books/2229/chapters");
});

it("refuses to edit a split that notes anchor to, and says what would break", async () => {
  const user = userEvent.setup();
  render(<PendingPublishPanel />);
  await screen.findByText("Faust");

  mockAdminFetch.mockResolvedValueOnce({
    chapters: [], editable: false, blocked_by: { annotations: 3 }, published: true,
  });
  await user.click(screen.getByRole("button", { name: /review split/i }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("3 annotations");
  expect(alert).toHaveTextContent(/wrong chapters/);
});

it("the finish button names the library, not the shelf", async () => {
  const user = userEvent.setup();
  render(<PendingPublishPanel />);
  await screen.findByText("Faust");

  mockAdminFetch.mockResolvedValueOnce(CHAPTERS);
  await user.click(screen.getByRole("button", { name: /review split/i }));

  // The queue row also offers "Add to library"; the panel's own finish button is
  // the second one, and the shelf wording must not appear at all here.
  const buttons = await screen.findAllByRole("button", { name: /add to library/i });
  expect(buttons.length).toBeGreaterThanOrEqual(2);
  expect(screen.queryByRole("button", { name: /add to shelf/i })).not.toBeInTheDocument();
});

it("closing the reviewer leaves the queue intact", async () => {
  const user = userEvent.setup();
  render(<PendingPublishPanel />);
  await screen.findByText("Faust");

  mockAdminFetch.mockResolvedValueOnce(CHAPTERS);
  await user.click(screen.getByRole("button", { name: /review split/i }));
  await screen.findByText(/Reviewing the split/);

  await user.click(screen.getByRole("button", { name: /^close$/i }));
  expect(screen.queryByText(/Reviewing the split/)).not.toBeInTheDocument();
  expect(screen.getByText("Faust")).toBeInTheDocument();
});

it("a failure opening the chapters is reported, not swallowed", async () => {
  const user = userEvent.setup();
  render(<PendingPublishPanel />);
  await screen.findByText("Faust");

  mockAdminFetch.mockRejectedValueOnce(new Error("Book is not frozen"));
  await user.click(screen.getByRole("button", { name: /review split/i }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Book is not frozen");
});
