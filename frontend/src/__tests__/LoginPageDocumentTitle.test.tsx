/**
 * Regression test for #2121 — login page must set document.title to "Sign In".
 */
import { render } from "@testing-library/react";
import LoginPage from "@/app/login/page";

jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}));

describe("LoginPage document.title (closes #2121)", () => {
  it("sets document.title to Sign In on mount", () => {
    render(<LoginPage />);
    expect(document.title).toContain("Sign In");
  });

  it("includes the app name in the title", () => {
    render(<LoginPage />);
    expect(document.title).toContain("Book Reader AI");
  });
});
