/**
 * ProviderKeySection — BYOK card used for the Claude and DeepSeek keys on the
 * profile page. Mirrors the Gemini section's behavior: save flow, remove flow,
 * error border + message on failure, a11y contract (labelled section,
 * aria-live status region).
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProviderKeySection from "@/components/ProviderKeySection";

function renderSection(overrides: Partial<React.ComponentProps<typeof ProviderKeySection>> = {}) {
  const props: React.ComponentProps<typeof ProviderKeySection> = {
    providerId: "claude",
    heading: "Claude API Key",
    description: "Add your Claude key.",
    placeholder: "sk-ant-…",
    hasKey: false,
    activeText: "Claude key is active.",
    savedText: "Claude API key saved.",
    removedText: "Claude key removed.",
    onSave: jest.fn().mockResolvedValue({ ok: true }),
    onRemove: jest.fn().mockResolvedValue({ ok: true }),
    onKeyChange: jest.fn(),
    ...overrides,
  };
  return { ...render(<ProviderKeySection {...props} />), props };
}

test("renders a labelled section with heading and password input", () => {
  renderSection();
  expect(screen.getByRole("region", { name: "Claude API Key" })).toBeInTheDocument();
  const input = screen.getByPlaceholderText("sk-ant-…");
  expect(input).toHaveAttribute("type", "password");
  expect(input).toHaveAttribute("placeholder", "sk-ant-…");
});

test("save button is disabled until a key is typed", async () => {
  renderSection();
  const button = screen.getByRole("button", { name: "Save key" });
  expect(button).toBeDisabled();
  await userEvent.type(screen.getByPlaceholderText("sk-ant-…"), "sk-ant-123");
  expect(button).toBeEnabled();
});

test("saving calls onSave with the trimmed key and reports success", async () => {
  const { props } = renderSection();
  await userEvent.type(screen.getByPlaceholderText("sk-ant-…"), "  sk-ant-123  ");
  await userEvent.click(screen.getByRole("button", { name: "Save key" }));

  await waitFor(() => expect(props.onSave).toHaveBeenCalledWith("sk-ant-123"));
  expect(props.onKeyChange).toHaveBeenCalledWith(true);
  expect(screen.getByRole("status")).toHaveTextContent("Claude API key saved.");
});

test("save failure shows the error message and red border", async () => {
  const { props } = renderSection({
    onSave: jest.fn().mockRejectedValue(new Error("Pro plan required")),
  });
  await userEvent.type(screen.getByPlaceholderText("sk-ant-…"), "sk-ant-123");
  await userEvent.click(screen.getByRole("button", { name: "Save key" }));

  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Pro plan required"));
  expect(props.onKeyChange).not.toHaveBeenCalled();
  const input = screen.getByPlaceholderText("sk-ant-…");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input.className).toContain("border-red-400");
});

test("with a stored key, shows the active banner and remove flow works", async () => {
  const { props } = renderSection({ hasKey: true });
  expect(screen.getByText("Claude key is active.")).toBeInTheDocument();
  expect(screen.queryByPlaceholderText("sk-ant-…")).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Remove key" }));
  await waitFor(() => expect(props.onRemove).toHaveBeenCalled());
  expect(props.onKeyChange).toHaveBeenCalledWith(false);
  expect(screen.getByRole("status")).toHaveTextContent("Claude key removed.");
});

test("remove failure reports the error and keeps hasKey unchanged", async () => {
  const { props } = renderSection({
    hasKey: true,
    onRemove: jest.fn().mockRejectedValue(new Error("Network down")),
  });
  await userEvent.click(screen.getByRole("button", { name: "Remove key" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Network down"));
  expect(props.onKeyChange).not.toHaveBeenCalled();
});

test("status region has the aria-live contract", () => {
  const { container } = renderSection();
  const status = container.querySelector("#claude-key-message");
  expect(status).not.toBeNull();
  expect(status).toHaveAttribute("role", "status");
  expect(status).toHaveAttribute("aria-live", "polite");
});
