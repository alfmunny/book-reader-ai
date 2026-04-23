import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UploadsPage from "@/app/admin/uploads/page";
import AdminLayout from "@/app/admin/layout";

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

const mockAdminFetch = jest.fn();
jest.mock("@/lib/adminFetch", () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/admin/uploads",
}));
jest.mock("@/lib/api", () => ({
  getMe: () => Promise.resolve({ id: 1, role: "admin" }),
  getAuthToken: () => "test-token",
  awaitSession: () => Promise.resolve(),
}));
jest.mock("next/link", () => {
  const MockLink = ({ href, children, ...rest }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>{children}</a>
  );
  MockLink.displayName = "MockLink";
  return { __esModule: true, default: MockLink };
});

const SAMPLE_UPLOADS = [
  {
    book_id: 1001,
    title: "My Uploaded Novel",
    filename: "novel.epub",
    file_size: 524288,
    format: "epub",
    uploaded_at: "2026-04-01T12:00:00",
    uploader_email: "alice@example.com",
    uploader_name: "Alice",
  },
  {
    book_id: 1002,
    title: "Another Book",
    filename: "another.txt",
    file_size: 102400,
    format: "txt",
    uploaded_at: "2026-04-02T08:30:00",
    uploader_email: "bob@example.com",
    uploader_name: "Bob",
  },
];

beforeEach(() => {
  mockAdminFetch.mockReset();
  mockAdminFetch.mockResolvedValue(SAMPLE_UPLOADS);
});

async function renderPage() {
  render(<UploadsPage />);
  await flushPromises();
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
}

describe("Admin Uploads page", () => {
  it("renders upload rows with title, uploader and format", async () => {
    await renderPage();
    expect(screen.getByText("My Uploaded Novel")).toBeInTheDocument();
    expect(screen.getByText("novel.epub")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("epub")).toBeInTheDocument();
    expect(screen.getByText("Another Book")).toBeInTheDocument();
  });

  it("shows empty state when no uploads exist", async () => {
    mockAdminFetch.mockResolvedValue([]);
    await renderPage();
    expect(screen.getByText(/no uploads yet/i)).toBeInTheDocument();
  });

  it("shows error when fetch fails", async () => {
    mockAdminFetch.mockRejectedValue(new Error("Server error"));
    await renderPage();
    expect(screen.getByText(/server error/i)).toBeInTheDocument();
  });

  it("filters uploads when user ID is entered and Filter is clicked", async () => {
    mockAdminFetch.mockImplementation((path: string) => {
      if (path.includes("user_id=99")) {
        return Promise.resolve([SAMPLE_UPLOADS[0]]);
      }
      return Promise.resolve(SAMPLE_UPLOADS);
    });

    await renderPage();

    const input = screen.getByPlaceholderText(/filter by user id/i);
    await userEvent.type(input, "99");
    const button = screen.getByRole("button", { name: /filter/i });
    await userEvent.click(button);
    await waitFor(() =>
      expect(mockAdminFetch).toHaveBeenCalledWith(expect.stringContaining("user_id=99")),
    );
  });
});

describe("Admin layout includes Uploads tab", () => {
  it("renders an Uploads tab link", async () => {
    render(
      <AdminLayout>
        <div>child</div>
      </AdminLayout>,
    );
    await waitFor(() => expect(screen.getByRole("link", { name: "Uploads" })).toBeInTheDocument());
  });
});
