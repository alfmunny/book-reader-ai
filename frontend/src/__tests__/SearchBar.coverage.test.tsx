/**
 * Branch-coverage tests for SearchBar (closes #1677). The pre-existing
 * SearchBar.test.tsx covers the basic open/submit flow; this file picks
 * up the three uncovered branches: global "/" shortcut (with input/
 * contentEditable guards), the explicit Esc close-button click, and the
 * <form onSubmit> wiring.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { SearchBar } from "@/components/SearchBar";

beforeEach(() => {
  mockPush.mockReset();
  document.body.innerHTML = "";
});

// Dispatch a bubbling keydown from a specific element so event.target is
// set naturally (Event.target is a read-only getter — we cannot Object.assign
// it). The component listens on `window`; the bubble path reaches it.
function dispatchKeyOn(el: EventTarget, key: string) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("SearchBar — global '/' keyboard shortcut (#1677)", () => {
  test("'/' opens the bar when focus is on the document body", async () => {
    render(<SearchBar />);
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    await act(async () => {
      dispatchKeyOn(document.body, "/");
    });
    expect(screen.getByRole("search")).toBeInTheDocument();
  });

  test("'/' is ignored when focus is inside an <input>", async () => {
    const otherInput = document.createElement("input");
    document.body.appendChild(otherInput);
    render(<SearchBar />);
    await act(async () => {
      dispatchKeyOn(otherInput, "/");
    });
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
  });

  test("'/' is ignored when focus is in a contentEditable element", async () => {
    // JSDOM does not auto-derive `isContentEditable` from the attribute the
    // same way real browsers do, so we stub the property to true on a span
    // (so its tagName is neither INPUT nor TEXTAREA, exercising only the
    // contentEditable branch of the guard).
    const ce = document.createElement("span");
    Object.defineProperty(ce, "isContentEditable", { value: true });
    document.body.appendChild(ce);
    render(<SearchBar />);
    await act(async () => {
      dispatchKeyOn(ce, "/");
    });
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
  });

  test("non-'/' keys never open the bar", async () => {
    render(<SearchBar />);
    await act(async () => {
      dispatchKeyOn(document.body, "k");
    });
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
  });
});

describe("SearchBar — Esc close button (#1677)", () => {
  test("clicking the Esc close button collapses the bar and clears the query", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.click(screen.getByRole("button", { name: /open search/i }));
    const input = screen.getByLabelText(/search your content/i) as HTMLInputElement;
    await user.type(input, "leftover");
    expect(input.value).toBe("leftover");
    await user.click(screen.getByRole("button", { name: /close search/i }));
    // Bar collapses; reopening shows an empty input — the query was cleared.
    expect(screen.queryByLabelText(/search your content/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open search/i }));
    expect(
      (screen.getByLabelText(/search your content/i) as HTMLInputElement).value,
    ).toBe("");
  });
});

describe("SearchBar — form onSubmit (#1677)", () => {
  test("submitting the form (not just Enter on input) navigates", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.click(screen.getByRole("button", { name: /open search/i }));
    const input = screen.getByLabelText(/search your content/i);
    await user.type(input, "Tolstoy");
    const form = screen.getByRole("search");
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(mockPush).toHaveBeenCalledWith("/search?q=Tolstoy");
  });

  test("submitting an empty form is a no-op (whitespace-trim guard)", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.click(screen.getByRole("button", { name: /open search/i }));
    const form = screen.getByRole("search");
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
