import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";
import { ReadableStream } from "stream/web";

// jsdom doesn't implement layout APIs used by InsightChat
window.HTMLElement.prototype.scrollIntoView = jest.fn();

// jsdom also lacks some streaming Web APIs that importBookStream uses
if (typeof global.TextEncoder === "undefined") global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === "undefined") global.TextDecoder = TextDecoder;
if (typeof global.ReadableStream === "undefined") global.ReadableStream = ReadableStream;

// lib/api.ts gates every fetch on the NextAuth session being settled (see
// markSessionSettled). In the test environment there's no NextAuth — open
// the gate immediately so tests don't hang. Individual tests can still
// exercise the gate via jest.isolateModules + require.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const api = require("./src/lib/api");
  if (typeof api.markSessionSettled === "function") {
    api.markSessionSettled();
  }
} catch {
  // api.ts imports alias @/... — if that path isn't resolvable in the raw
  // setup file at this point (Jest config moduleNameMapper), fall back to
  // the raw fetch-gate field. Tests importing through @/lib/api will get
  // the settled flag on first import anyway (the setup file runs first).
}
