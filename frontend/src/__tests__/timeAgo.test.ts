/**
 * Relative timestamps (owner request, 2026-08-28): recent = relative,
 * old = date, hover = exact.
 */
import { timeAgo, parseDbTime, exactTime } from "@/lib/timeAgo";

const NOW = new Date("2026-08-28T12:00:00Z").getTime();

test("SQLite UTC timestamps parse as UTC", () => {
  expect(parseDbTime("2026-08-28 11:00:00").toISOString()).toBe("2026-08-28T11:00:00.000Z");
});

test("recent moments are relative", () => {
  expect(timeAgo("2026-08-28 11:59:40", NOW)).toBe("just now");
  expect(timeAgo("2026-08-28 11:55:00", NOW)).toBe("5 min ago");
  expect(timeAgo("2026-08-28 09:00:00", NOW)).toBe("3 h ago");
  expect(timeAgo("2026-08-27 11:00:00", NOW)).toBe("1 day ago");
  expect(timeAgo("2026-08-25 12:00:00", NOW)).toBe("3 days ago");
});

test("older than a week falls back to a date", () => {
  const label = timeAgo("2026-08-01 12:00:00", NOW);
  expect(label).toMatch(/Aug|8/);
  expect(label).not.toMatch(/ago/);
});

test("exactTime yields a full local datetime and tolerates garbage", () => {
  expect(exactTime("2026-08-28 11:00:00")).not.toBe("");
  expect(exactTime("nonsense")).toBe("");
  expect(timeAgo("nonsense", NOW)).toBe("");
});
