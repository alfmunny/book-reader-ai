/**
 * Tests for lib/adminFetch.ts
 */

jest.mock("@/lib/api", () => ({
  getAuthToken: jest.fn(),
  awaitSession: jest.fn().mockResolvedValue(undefined),
}));

import * as api from "@/lib/api";
import { adminFetch } from "@/lib/adminFetch";

const mockGetAuthToken = api.getAuthToken as jest.MockedFunction<typeof api.getAuthToken>;
const mockAwaitSession = api.awaitSession as jest.MockedFunction<typeof api.awaitSession>;

function setupFetch(ok: boolean, body: unknown, statusText = "Bad Request") {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    statusText,
    json: jest.fn().mockResolvedValue(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAwaitSession.mockResolvedValue(undefined);
});

test("sends Authorization header with token", async () => {
  mockGetAuthToken.mockReturnValue("test-token-abc");
  setupFetch(true, { data: "ok" });

  await adminFetch("/some/path");

  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/some/path"),
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: "Bearer test-token-abc",
      }),
    })
  );
});

test("does not send Authorization header when token is null", async () => {
  mockGetAuthToken.mockReturnValue(null);
  setupFetch(true, { data: "ok" });

  await adminFetch("/some/path");

  const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
  expect(callArgs.headers).not.toHaveProperty("Authorization");
});

test("returns parsed JSON on success", async () => {
  mockGetAuthToken.mockReturnValue("token-xyz");
  setupFetch(true, { users_total: 42 });

  const result = await adminFetch("/stats");

  expect(result).toEqual({ users_total: 42 });
});

test("throws an error with detail message on non-ok response", async () => {
  mockGetAuthToken.mockReturnValue("token");
  setupFetch(false, { detail: "Forbidden" }, "Forbidden");

  await expect(adminFetch("/admin/resource")).rejects.toThrow("Forbidden");
});

test("throws 'Request failed' when body has no detail field", async () => {
  mockGetAuthToken.mockReturnValue("token");
  setupFetch(false, {}, "Internal Server Error");

  await expect(adminFetch("/admin/resource")).rejects.toThrow("Request failed");
});

test("throws using statusText when body JSON cannot be parsed", async () => {
  mockGetAuthToken.mockReturnValue("token");
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    statusText: "Service Unavailable",
    json: jest.fn().mockRejectedValue(new Error("not json")),
  });

  await expect(adminFetch("/admin/resource")).rejects.toThrow("Service Unavailable");
});

test("awaits session before making the request", async () => {
  mockGetAuthToken.mockReturnValue("token");
  setupFetch(true, {});

  await adminFetch("/path");

  expect(mockAwaitSession).toHaveBeenCalled();
  // fetch is called after awaitSession resolves
  expect(global.fetch).toHaveBeenCalled();
});

test("sends Content-Type application/json header", async () => {
  mockGetAuthToken.mockReturnValue(null);
  setupFetch(true, {});

  await adminFetch("/path");

  expect(global.fetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      headers: expect.objectContaining({
        "Content-Type": "application/json",
      }),
    })
  );
});
