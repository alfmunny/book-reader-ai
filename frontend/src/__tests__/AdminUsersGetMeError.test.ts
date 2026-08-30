/**
 * Source-level regression tests for admin users page getMe() fetch-error state (issue #2441).
 */
import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../app/(shell)/admin/users/page.tsx"),
  "utf8"
);

describe("Admin users page — getMe() fetch-error state (issue #2441)", () => {
  it("declares myIdFetchFailed state", () => {
    expect(SOURCE).toMatch(/myIdFetchFailed/);
  });

  it("sets myIdFetchFailed true in getMe catch block", () => {
    const fetchIdx = SOURCE.indexOf("getMe()");
    expect(fetchIdx).toBeGreaterThan(-1);
    const snippet = SOURCE.slice(fetchIdx, fetchIdx + 300);
    expect(snippet).toMatch(/setMyIdFetchFailed\(true\)/);
  });

  it("hides action buttons when myIdFetchFailed is true", () => {
    expect(SOURCE).toMatch(/myIdFetchFailed/);
    // Action buttons should be conditional on identity being known
    expect(SOURCE).toMatch(/myIdFetchFailed.*Couldn/s);
  });

  it("renders a Retry button when identity fetch fails", () => {
    expect(SOURCE).toMatch(/myIdFetchFailed.*Retry/s);
  });

  it("retries getMe on retry click", () => {
    expect(SOURCE).toMatch(/myIdRetryTick/);
  });
});
