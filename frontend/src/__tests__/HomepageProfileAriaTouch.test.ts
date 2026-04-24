/**
 * Regression tests for issue #585 — homepage profile button missing aria-label
 * and below 44px touch target; admin button using inline SVG instead of SettingsIcon.
 */
import fs from "fs";
import path from "path";

const pageSrc = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf-8"
);

const iconsSrc = fs.readFileSync(
  path.join(__dirname, "../components/Icons.tsx"),
  "utf-8"
);

describe("Homepage profile button a11y (#585)", () => {
  it("profile button has aria-label", () => {
    expect(pageSrc).toMatch(/aria-label=\{session\?\.backendUser\?\.name/);
  });

  it("profile button is at least 44px on mobile (w-11)", () => {
    expect(pageSrc).toMatch(/w-11 h-11/);
  });
});

describe("Homepage admin button icon (#585)", () => {
  it("imports SettingsIcon from Icons.tsx", () => {
    expect(pageSrc).toMatch(/SettingsIcon/);
  });

  it("admin button does not use inline <svg>", () => {
    const adminIdx = pageSrc.indexOf("admin-tab");
    const snippet = pageSrc.slice(adminIdx, adminIdx + 500);
    expect(snippet).not.toMatch(/<svg /);
  });

  it("SettingsIcon is defined in Icons.tsx", () => {
    expect(iconsSrc).toMatch(/export function SettingsIcon/);
  });

  it("SettingsIcon uses aria-hidden", () => {
    const settingsIdx = iconsSrc.indexOf("export function SettingsIcon");
    const snippet = iconsSrc.slice(settingsIdx, settingsIdx + 400);
    expect(snippet).toMatch(/aria-hidden="true"/);
  });
});
