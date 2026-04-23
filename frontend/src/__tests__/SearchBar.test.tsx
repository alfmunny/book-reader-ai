import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { SearchBar } from "@/components/SearchBar";

describe("SearchBar", () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  it("starts collapsed with an aria-labeled open button", () => {
    render(<SearchBar />);
    expect(screen.getByRole("button", { name: /open search/i })).toBeInTheDocument();
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
  });

  it("expands on click and shows an input", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.click(screen.getByRole("button", { name: /open search/i }));
    const input = screen.getByLabelText(/search your content/i);
    expect(input).toBeInTheDocument();
  });

  it("navigates to /search with encoded query on Enter", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.click(screen.getByRole("button", { name: /open search/i }));
    const input = screen.getByLabelText(/search your content/i);
    await user.type(input, "Kafka & Trial{Enter}");
    expect(mockPush).toHaveBeenCalledWith("/search?q=Kafka%20%26%20Trial");
  });

  it("does not navigate for whitespace-only queries", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.click(screen.getByRole("button", { name: /open search/i }));
    const input = screen.getByLabelText(/search your content/i);
    await user.type(input, "   {Enter}");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("collapses on Escape", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.click(screen.getByRole("button", { name: /open search/i }));
    const input = screen.getByLabelText(/search your content/i);
    await user.type(input, "foo{Escape}");
    expect(screen.queryByLabelText(/search your content/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open search/i })).toBeInTheDocument();
  });

  it("caps input at 200 characters", async () => {
    const user = userEvent.setup();
    render(<SearchBar />);
    await user.click(screen.getByRole("button", { name: /open search/i }));
    const input = screen.getByLabelText(/search your content/i) as HTMLInputElement;
    expect(input.getAttribute("maxLength")).toBe("200");
  });
});
