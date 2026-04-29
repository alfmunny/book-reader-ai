/**
 * Regression test for #2115 — import page must update document.title
 * to "Importing {Book Title} — Book Reader AI" when the meta event fires.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BookImportPage from "@/app/import/[bookId]/page";

jest.mock("next/navigation", () => ({
  useParams: jest.fn().mockReturnValue({ bookId: "1342" }),
  useRouter: jest.fn().mockReturnValue({ push: jest.fn() }),
  useSearchParams: jest.fn().mockReturnValue({ get: jest.fn().mockReturnValue(null) }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  importBookStream: jest.fn(),
}));

const { importBookStream } = require("@/lib/api");

async function* makeStream(events: object[]) {
  for (const ev of events) yield ev;
}

beforeEach(() => {
  jest.clearAllMocks();
  document.title = "Import — Book Reader AI";
});

afterEach(() => {
  document.title = "Book Reader AI";
});

describe("Import page document.title (closes #2115)", () => {
  it("updates document.title to include book name after meta event", async () => {
    importBookStream.mockReturnValue(
      makeStream([{ event: "meta", title: "Pride and Prejudice" }])
    );
    render(<BookImportPage />);

    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    await waitFor(() =>
      expect(document.title).toContain("Pride and Prejudice")
    );
    expect(document.title).toContain("Book Reader AI");
  });

  it("keeps default title when book title is not yet known", async () => {
    importBookStream.mockReturnValue(makeStream([]));
    render(<BookImportPage />);

    expect(document.title).toBe("Import — Book Reader AI");
  });

  it("restores default title on unmount", async () => {
    importBookStream.mockReturnValue(
      makeStream([{ event: "meta", title: "Faust" }])
    );
    const { unmount } = render(<BookImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));
    await waitFor(() => expect(document.title).toContain("Faust"));

    unmount();
    expect(document.title).not.toContain("Faust");
  });
});
