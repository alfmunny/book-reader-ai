/**
 * Tests for lib/api.ts → importBookStream()
 *
 * Mocks fetch with a ReadableStream that yields SSE frames, and checks
 * that the async generator parses events correctly.
 */

import { setAuthToken, importBookStream } from "@/lib/api";

// Minimal Response-like mock — only the properties importBookStream touches.
function sseStream(frames: string[]): unknown {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    body: {
      getReader: () => ({
        async read() {
          if (i >= frames.length) return { done: true, value: undefined };
          const value = encoder.encode(frames[i++]);
          return { done: false, value };
        },
      }),
    },
  };
}

beforeEach(() => {
  setAuthToken("test-jwt");
});

test("yields parsed SSE events in order", async () => {
  global.fetch = jest.fn().mockResolvedValue(
    sseStream([
      `event: stage\ndata: {"stage":"fetching"}\n\n`,
      `event: meta\ndata: {"book_id":1342,"title":"P&P"}\n\n`,
      `event: done\ndata: {"book_id":1342}\n\n`,
    ]),
  );

  const events = [];
  for await (const ev of importBookStream(1342)) {
    events.push(ev);
  }

  expect(events).toEqual([
    { event: "stage", stage: "fetching" },
    { event: "meta", book_id: 1342, title: "P&P" },
    { event: "done", book_id: 1342 },
  ]);
});

test("calls the correct URL without target_language param", async () => {
  global.fetch = jest.fn().mockResolvedValue(sseStream([]));

  const gen = importBookStream(1342);
  await gen.next();

  const [url] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toContain("/books/1342/import-stream");
  expect(url).not.toContain("target_language");
});

test("sends Authorization header from auth token", async () => {
  global.fetch = jest.fn().mockResolvedValue(sseStream([]));

  const gen = importBookStream(1342);
  await gen.next();

  const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers;
  expect(headers.Authorization).toBe("Bearer test-jwt");
});

test("handles SSE frame split across chunks", async () => {
  global.fetch = jest.fn().mockResolvedValue(
    sseStream([
      `event: stage\ndata: {"sta`,
      `ge":"fetching"}\n\nevent: done\ndata: {}\n\n`,
    ]),
  );

  const events = [];
  for await (const ev of importBookStream(1)) {
    events.push(ev);
  }
  expect(events.length).toBe(2);
  expect(events[0]).toEqual({ event: "stage", stage: "fetching" });
  expect(events[1]).toEqual({ event: "done" });
});

test("throws on non-ok response", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    statusText: "Forbidden",
    body: null,
    json: jest.fn().mockResolvedValue({ detail: "Access denied" }),
  });

  const gen = importBookStream(1342);
  await expect(gen.next()).rejects.toThrow("Access denied");
});
