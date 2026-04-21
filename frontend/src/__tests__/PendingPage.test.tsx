/**
 * Tests for app/pending/page.tsx
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

jest.mock("next-auth/react", () => ({
  signOut: jest.fn(),
}));

import { signOut } from "next-auth/react";
import PendingApprovalPage from "@/app/pending/page";

const mockSignOut = signOut as jest.MockedFunction<typeof signOut>;

beforeEach(() => {
  jest.clearAllMocks();
});

test("renders heading and description text", () => {
  render(<PendingApprovalPage />);
  expect(screen.getByRole("heading", { name: /account pending/i })).toBeInTheDocument();
  expect(screen.getByText(/waiting for admin approval/i)).toBeInTheDocument();
});

test("renders sign out button", () => {
  render(<PendingApprovalPage />);
  expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
});

test("sign out button calls signOut with callbackUrl='/login'", () => {
  render(<PendingApprovalPage />);
  fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
  expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
});
