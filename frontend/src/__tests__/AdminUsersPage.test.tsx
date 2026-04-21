/**
 * Tests for the admin users page.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAdminFetch = jest.fn();
const mockGetMe = jest.fn();

jest.mock("@/lib/adminFetch", () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

jest.mock("@/lib/api", () => ({
  getMe: (...args: unknown[]) => mockGetMe(...args),
}));

let UsersPage: React.ComponentType;
beforeAll(async () => {
  const mod = await import("@/app/admin/users/page");
  UsersPage = mod.default;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMe.mockResolvedValue({ id: 99 });
});

const SAMPLE_USERS = [
  {
    id: 1,
    email: "alice@example.com",
    name: "Alice",
    picture: "",
    role: "user",
    approved: 1,
    created_at: "2024-01-01",
  },
  {
    id: 2,
    email: "bob@example.com",
    name: "Bob",
    picture: "",
    role: "admin",
    approved: 0,
    created_at: "2024-01-02",
  },
];

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

describe("AdminUsersPage", () => {
  it("shows loading spinner initially", () => {
    mockAdminFetch.mockReturnValue(new Promise(() => {}));
    render(<UsersPage />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders user list after load", async () => {
    mockAdminFetch.mockResolvedValue(SAMPLE_USERS);
    render(<UsersPage />);
    await flushPromises();
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows user emails", async () => {
    mockAdminFetch.mockResolvedValue(SAMPLE_USERS);
    render(<UsersPage />);
    await flushPromises();
    expect(await screen.findByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
  });

  it("shows admin badge for admin users", async () => {
    mockAdminFetch.mockResolvedValue(SAMPLE_USERS);
    render(<UsersPage />);
    await flushPromises();
    expect(await screen.findByText("admin")).toBeInTheDocument();
  });

  it("shows pending badge for unapproved users", async () => {
    mockAdminFetch.mockResolvedValue(SAMPLE_USERS);
    render(<UsersPage />);
    await flushPromises();
    expect(await screen.findByText("pending")).toBeInTheDocument();
  });

  it("shows Revoke button for approved users", async () => {
    mockAdminFetch.mockResolvedValue(SAMPLE_USERS);
    render(<UsersPage />);
    await flushPromises();
    expect(await screen.findByRole("button", { name: /revoke/i })).toBeInTheDocument();
  });

  it("shows Approve button for pending users", async () => {
    mockAdminFetch.mockResolvedValue(SAMPLE_USERS);
    render(<UsersPage />);
    await flushPromises();
    expect(await screen.findByRole("button", { name: /approve/i })).toBeInTheDocument();
  });

  it("calls approve endpoint when Approve is clicked", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_USERS) // initial load
      .mockResolvedValueOnce({})           // PUT approve
      .mockResolvedValueOnce(SAMPLE_USERS); // reload
    render(<UsersPage />);
    await flushPromises();

    const approveBtn = await screen.findByRole("button", { name: /approve/i });
    await userEvent.click(approveBtn);

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledWith(
        "/admin/users/2/approve",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ approved: true }),
        }),
      );
    });
  });

  it("calls revoke endpoint when Revoke is clicked", async () => {
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_USERS)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(SAMPLE_USERS);
    render(<UsersPage />);
    await flushPromises();

    const revokeBtn = await screen.findByRole("button", { name: /revoke/i });
    await userEvent.click(revokeBtn);

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledWith(
        "/admin/users/1/approve",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ approved: false }),
        }),
      );
    });
  });

  it("calls delete endpoint when Del is confirmed", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_USERS)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce([SAMPLE_USERS[1]]);
    render(<UsersPage />);
    await flushPromises();

    const delBtns = await screen.findAllByRole("button", { name: /del/i });
    await userEvent.click(delBtns[0]);

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledWith(
        "/admin/users/1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("does not call delete when confirm is cancelled", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    mockAdminFetch.mockResolvedValueOnce(SAMPLE_USERS);
    render(<UsersPage />);
    await flushPromises();

    const delBtns = await screen.findAllByRole("button", { name: /del/i });
    await userEvent.click(delBtns[0]);

    // Only the initial GET call
    expect(mockAdminFetch).toHaveBeenCalledTimes(1);
  });

  it("alerts 'Failed' when delete action throws non-Error", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    jest.spyOn(window, "alert").mockImplementation(() => {});
    mockAdminFetch
      .mockResolvedValueOnce(SAMPLE_USERS)
      .mockRejectedValueOnce("boom");
    render(<UsersPage />);
    await flushPromises();

    const delBtns = await screen.findAllByRole("button", { name: /del/i });
    await userEvent.click(delBtns[0]);

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith("Failed"));
  });

  it("shows 'You' label for the current user instead of action buttons", async () => {
    mockGetMe.mockResolvedValue({ id: 1 }); // myId = Alice's id
    mockAdminFetch.mockResolvedValue(SAMPLE_USERS);
    render(<UsersPage />);
    await flushPromises();
    expect(await screen.findByText("You")).toBeInTheDocument();
  });

  it("shows error message when fetch fails", async () => {
    mockAdminFetch.mockRejectedValue(new Error("Unauthorized"));
    render(<UsersPage />);
    await flushPromises();
    expect(await screen.findByText("Unauthorized")).toBeInTheDocument();
  });

  it("shows generic error when non-Error is thrown", async () => {
    mockAdminFetch.mockRejectedValue("boom");
    render(<UsersPage />);
    await flushPromises();
    expect(await screen.findByText("Failed to load users")).toBeInTheDocument();
  });

  it("renders avatar initials when picture is empty", async () => {
    mockAdminFetch.mockResolvedValue(SAMPLE_USERS);
    render(<UsersPage />);
    await flushPromises();
    // First letter of "Alice" and "Bob" shown as initials
    expect(await screen.findByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("renders img when picture URL is present", async () => {
    const usersWithPicture = [{ ...SAMPLE_USERS[0], picture: "https://example.com/pic.jpg" }];
    mockAdminFetch.mockResolvedValue(usersWithPicture);
    render(<UsersPage />);
    await flushPromises();
    await waitFor(() => {
      const img = document.querySelector("img");
      expect(img).toBeInTheDocument();
      expect(img?.getAttribute("src")).toBe("https://example.com/pic.jpg");
    });
  });
});
