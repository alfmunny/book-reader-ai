import { render, screen, fireEvent } from "@testing-library/react";
import AuthPromptModal from "@/components/AuthPromptModal";

describe("AuthPromptModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <AuthPromptModal open={false} feature="translate books" onClose={jest.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows feature name when open", () => {
    render(<AuthPromptModal open feature="save vocabulary" onClose={jest.fn()} />);
    expect(screen.getByText(/sign in to save vocabulary/i)).toBeInTheDocument();
  });

  it("has a Sign in link pointing to auth", () => {
    render(<AuthPromptModal open feature="save annotations and notes" onClose={jest.fn()} />);
    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toHaveAttribute("href", "/api/auth/signin");
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = jest.fn();
    const { container } = render(
      <AuthPromptModal open feature="translate books" onClose={onClose} />
    );
    // Click the backdrop (first child of the modal container)
    const backdrop = container.querySelector(".absolute.inset-0");
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Maybe later is clicked", () => {
    const onClose = jest.fn();
    render(<AuthPromptModal open feature="translate books" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /maybe later/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape key", () => {
    const onClose = jest.fn();
    render(<AuthPromptModal open feature="translate books" onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
