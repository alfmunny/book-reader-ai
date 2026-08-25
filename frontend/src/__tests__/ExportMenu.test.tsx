/**
 * ExportMenu — the "Export" button that offers Markdown download vs Obsidian (#2703).
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExportMenu from "@/components/ExportMenu";
import { DownloadIcon, ArrowUpRightIcon } from "@/components/Icons";

function setup(props: Partial<React.ComponentProps<typeof ExportMenu>> = {}) {
  const onDownload = jest.fn();
  const onObsidian = jest.fn();
  render(
    <ExportMenu
      options={[
        { key: "md", label: "Download Markdown", description: "Save a .md file", icon: <DownloadIcon className="w-4 h-4" />, onSelect: onDownload },
        { key: "obsidian", label: "Export to Obsidian", description: "Push to your vault", icon: <ArrowUpRightIcon className="w-4 h-4" />, onSelect: onObsidian },
      ]}
      {...props}
    />,
  );
  return { onDownload, onObsidian };
}

test("renders a collapsed Export trigger", () => {
  setup();
  const trigger = screen.getByRole("button", { name: /export/i });
  expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("opens a menu with both options", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: /export/i }));

  expect(screen.getByRole("button", { name: /export/i })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("menu")).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /download markdown/i })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /export to obsidian/i })).toBeInTheDocument();
});

test("selecting an option fires its handler and closes the menu", async () => {
  const { onDownload, onObsidian } = setup();
  await userEvent.click(screen.getByRole("button", { name: /export/i }));
  await userEvent.click(screen.getByRole("menuitem", { name: /download markdown/i }));

  expect(onDownload).toHaveBeenCalledTimes(1);
  expect(onObsidian).not.toHaveBeenCalled();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("the Obsidian option still reaches the vault flow", async () => {
  const { onDownload, onObsidian } = setup();
  await userEvent.click(screen.getByRole("button", { name: /export/i }));
  await userEvent.click(screen.getByRole("menuitem", { name: /export to obsidian/i }));

  expect(onObsidian).toHaveBeenCalledTimes(1);
  expect(onDownload).not.toHaveBeenCalled();
});

test("Escape closes the menu and returns focus to the trigger", async () => {
  setup();
  const trigger = screen.getByRole("button", { name: /export/i });
  await userEvent.click(trigger);
  await userEvent.keyboard("{Escape}");

  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test("clicking outside closes the menu", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: /export/i }));
  expect(screen.getByRole("menu")).toBeInTheDocument();

  await userEvent.click(document.body);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("arrow keys move focus between menu items", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: /export/i }));

  const [first, second] = screen.getAllByRole("menuitem");
  expect(first).toHaveFocus();

  await userEvent.keyboard("{ArrowDown}");
  expect(second).toHaveFocus();

  await userEvent.keyboard("{ArrowUp}");
  expect(first).toHaveFocus();
});

test("does not open while disabled", async () => {
  setup({ disabled: true });
  const trigger = screen.getByRole("button", { name: /export/i });
  expect(trigger).toBeDisabled();

  await userEvent.click(trigger);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("shows a busy label and blocks opening while an export runs", async () => {
  setup({ busy: true });
  expect(screen.getByRole("button", { name: /exporting/i })).toBeDisabled();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

test("menu items meet the 44px mobile touch target and carry their icons", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: /export/i }));

  for (const item of screen.getAllByRole("menuitem")) {
    expect(item.className).toContain("min-h-[44px]");
    expect(item.querySelector("svg")).toBeTruthy();
  }
});

test("the menu is labelled for assistive tech", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: /export/i }));
  expect(screen.getByRole("menu")).toHaveAccessibleName(/export options/i);
});
