/**
 * Tests for the login page — verifies all three OAuth buttons (Google, GitHub, Apple)
 * are rendered and call signIn with the correct provider.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next-auth/react so signIn is controllable
const mockSignIn = jest.fn();
jest.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

// Mock next/navigation for useSearchParams
jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

// Dynamic import of the component after mocks are set up
let LoginForm: React.ComponentType;
beforeAll(async () => {
  // We import the inner LoginForm by importing the default export (LoginPage wraps it
  // in Suspense; we test the inner logic by rendering the full page with Suspense)
  const mod = await import("@/app/login/page");
  LoginForm = mod.default;
});

beforeEach(() => {
  mockSignIn.mockClear();
});

describe("LoginPage", () => {
  it("renders Google sign-in button", () => {
    render(<LoginForm />);
    expect(screen.getByText("Continue with Google")).toBeInTheDocument();
  });

  it("renders GitHub sign-in button", () => {
    render(<LoginForm />);
    expect(screen.getByText("Continue with GitHub")).toBeInTheDocument();
  });

  it("renders Apple sign-in button", () => {
    render(<LoginForm />);
    expect(screen.getByText("Continue with Apple")).toBeInTheDocument();
  });

  it("clicking Apple button calls signIn with 'apple'", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(screen.getByText("Continue with Apple"));
    expect(mockSignIn).toHaveBeenCalledWith("apple", expect.objectContaining({ callbackUrl: "/" }));
  });

  it("clicking Google button calls signIn with 'google'", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(screen.getByText("Continue with Google"));
    expect(mockSignIn).toHaveBeenCalledWith("google", expect.objectContaining({ callbackUrl: "/" }));
  });

  it("clicking GitHub button calls signIn with 'github'", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(screen.getByText("Continue with GitHub"));
    expect(mockSignIn).toHaveBeenCalledWith("github", expect.objectContaining({ callbackUrl: "/" }));
  });
});
