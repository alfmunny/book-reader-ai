/**
 * Tests for the DeckCard component (slice 3a of #741).
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DeckCard from "@/components/DeckCard";
import type { DeckSummary } from "@/lib/api";

const MANUAL_DECK: DeckSummary = {
  id: 1,
  name: "German verbs",
  description: "Regular and irregular verbs from my reading",
  mode: "manual",
  rules_json: null,
  created_at: "2026-04-24T08:00:00",
  updated_at: "2026-04-24T08:00:00",
  member_count: 12,
  due_today: 3,
};

const SMART_DECK: DeckSummary = {
  id: 2,
  name: "All A1 German",
  description: "",
  mode: "smart",
  rules_json: '{"language":"de"}',
  created_at: "2026-04-24T08:00:00",
  updated_at: "2026-04-24T08:00:00",
  member_count: 45,
  due_today: 0,
};

test("renders name, description, member count and due-today badge", () => {
  render(<DeckCard deck={MANUAL_DECK} />);
  expect(screen.getByText("German verbs")).toBeInTheDocument();
  expect(screen.getByText(/Regular and irregular verbs/)).toBeInTheDocument();
  expect(screen.getByTestId(`deck-member-count-${MANUAL_DECK.id}`)).toHaveTextContent("12");
  expect(screen.getByTestId(`deck-due-today-${MANUAL_DECK.id}`)).toHaveTextContent("3");
});

test("renders the mode badge ('manual' vs 'smart')", () => {
  const { rerender } = render(<DeckCard deck={MANUAL_DECK} />);
  expect(screen.getByTestId(`deck-mode-${MANUAL_DECK.id}`)).toHaveTextContent(/manual/i);

  rerender(<DeckCard deck={SMART_DECK} />);
  expect(screen.getByTestId(`deck-mode-${SMART_DECK.id}`)).toHaveTextContent(/smart/i);
});

test("hides the due-today badge when nothing is due", () => {
  render(<DeckCard deck={SMART_DECK} />);
  expect(screen.queryByTestId(`deck-due-today-${SMART_DECK.id}`)).not.toBeInTheDocument();
});

test("calls onDelete with deck id when the delete button is clicked", async () => {
  const onDelete = jest.fn();
  render(<DeckCard deck={MANUAL_DECK} onDelete={onDelete} />);
  const user = userEvent.setup();
  await user.click(screen.getByTestId(`deck-delete-${MANUAL_DECK.id}`));
  expect(onDelete).toHaveBeenCalledWith(MANUAL_DECK.id);
});

test("does not render delete button when no onDelete prop is supplied", () => {
  render(<DeckCard deck={MANUAL_DECK} />);
  expect(screen.queryByTestId(`deck-delete-${MANUAL_DECK.id}`)).not.toBeInTheDocument();
});

test("delete button has an accessible label", () => {
  render(<DeckCard deck={MANUAL_DECK} onDelete={jest.fn()} />);
  expect(screen.getByTestId(`deck-delete-${MANUAL_DECK.id}`)).toHaveAttribute(
    "aria-label",
    expect.stringMatching(/delete/i),
  );
});
