/**
 * Regression test for #1955: import page inline error banner must include
 * AlertCircleIcon (SVG) when the import stream throws an error.
 */
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useParams: jest.fn().mockReturnValue({ bookId: "1342" }),
  useRouter: jest.fn().mockReturnValue({ push: jest.fn() }),
  useSearchParams: jest.fn().mockReturnValue({ get: jest.fn().mockReturnValue(null) }),
}));

const mockImportBookStream = jest.fn();

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    importBookStream: (...args: unknown[]) => mockImportBookStream(...args),
  };
});

import ImportPage from "@/app/import/[bookId]/page";

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

async function* failStream() {
  throw new Error("network error");
  yield {}; // unreachable
}

test("import error alert contains SVG icon (AlertCircleIcon)", async () => {
  mockImportBookStream.mockReturnValue(failStream());

  render(<ImportPage />);
  fireEvent.click(screen.getByRole("button", { name: /start import/i }));

  await waitFor(() => {
    const alert = screen.queryByRole("alert");
    expect(alert).not.toBeNull();
    const svg = alert!.querySelector("svg");
    expect(svg).not.toBeNull();
  });
});
