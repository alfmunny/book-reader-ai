/**
 * Regression test for the refresh-to-home bug.
 *
 * Before the fix, calling a protected API function before TokenSync had
 * finished hydrating the session would fire a fetch without an
 * Authorization header. The backend would return 401, pages would catch
 * the error and `router.push("/")`, so every F5 on /admin, /reader, /profile
 * kicked the user to the home page.
 *
 * The fix gates `request()` on a `markSessionSettled()` call. These tests
 * verify that:
 *   1. Calls made before markSessionSettled() is called are queued.
 *   2. They fire with the current token once the gate opens.
 */

import { setAuthToken, markSessionSettled, getMe } from "@/lib/api";

beforeEach(() => {
  // Reset the module-level state between tests. We do it by re-importing —
  // but Jest caches modules. Instead, we rely on the marker being idempotent
  // and rebuild the test harness per case.
  jest.resetModules();
});

test("request waits for markSessionSettled before firing fetch", async () => {
  // Use jest.isolateModules so the module-level _sessionSettled flag starts fresh.
  let fetchCalled = false;
  jest.isolateModules(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require("@/lib/api");

    global.fetch = jest.fn().mockImplementation(() => {
      fetchCalled = true;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 1, email: "a@b.com", name: "A", picture: "", hasGeminiKey: false }),
      });
    });

    api.setAuthToken("my-jwt");
    const pending = api.getMe();

    // Fetch should NOT have fired yet — session is not settled
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchCalled).toBe(false);

    // Now signal that the session has settled
    api.markSessionSettled();

    await pending;
    expect(fetchCalled).toBe(true);
  });
});

test("calls made after settle fire immediately", async () => {
  jest.isolateModules(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require("@/lib/api");

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1, email: "a@b.com", name: "A", picture: "", hasGeminiKey: false }),
    });

    api.setAuthToken("tok");
    api.markSessionSettled();   // already settled

    await api.getMe();
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(1);
    const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer tok");
  });
});
