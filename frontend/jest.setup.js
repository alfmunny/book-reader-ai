import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";
import { ReadableStream } from "stream/web";

// jsdom doesn't implement layout APIs used by InsightChat
window.HTMLElement.prototype.scrollIntoView = jest.fn();

// jsdom also lacks some streaming Web APIs that importBookStream uses
if (typeof global.TextEncoder === "undefined") global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === "undefined") global.TextDecoder = TextDecoder;
if (typeof global.ReadableStream === "undefined") global.ReadableStream = ReadableStream;
