/**
 * api.ts — ApiError status codes, markSessionSettled/awaitSession gate,
 * and status-specific error propagation.
 */
import {
  setAuthToken,
  markSessionSettled,
  awaitSession,
  ApiError,
  getBookMeta,
  getMe,
  saveGeminiKey,
  requestChapterTranslation,
  getChapterTranslation,
} from "@/lib/api";

function mockResponse(body: unknown, status: number) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: jest.fn().mockResolvedValue(body),
  });
}

beforeEach(() => {
  setAuthToken("test-token");
  // Ensure session is settled so requests don't block
  markSessionSettled();
  jest.clearAllMocks();
});

describe("ApiError — status code propagation", () => {
  it("throws ApiError with status 401 on unauthorized response", async () => {
    mockResponse({ detail: "Not authenticated" }, 401);
    await expect(getMe()).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      message: "Not authenticated",
    });
  });

  it("throws ApiError with status 403 on forbidden response", async () => {
    mockResponse({ detail: "Gemini API key required" }, 403);
    await expect(
      requestChapterTranslation(1342, 0, "de")
    ).rejects.toMatchObject({ status: 403 });
  });

  it("throws ApiError with status 404 on not found response", async () => {
    mockResponse({ detail: "Translation not cached" }, 404);
    await expect(
      getChapterTranslation(1342, 0, "de")
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws ApiError with status 400 on bad request", async () => {
    mockResponse({ detail: "Cannot translate to same language" }, 400);
    await expect(
      requestChapterTranslation(1342, 0, "en")
    ).rejects.toMatchObject({ status: 400 });
  });

  it("uses statusText as fallback when response body has no detail field", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: jest.fn().mockRejectedValue(new Error("no json")),
    });
    await expect(getBookMeta(1)).rejects.toThrow("Internal Server Error");
  });

  it("ApiError instance is instanceof Error", async () => {
    mockResponse({ detail: "Oops" }, 500);
    try {
      await getBookMeta(1);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(ApiError);
    }
  });
});

describe("awaitSession — session-settled gate", () => {
  it("resolves immediately when session is already settled", async () => {
    // markSessionSettled() was called in beforeEach
    const resolved = jest.fn();
    await awaitSession().then(resolved);
    expect(resolved).toHaveBeenCalled();
  });
});

describe("getChapterTranslation — read-only cache check", () => {
  it("sends GET request to the correct endpoint", async () => {
    mockResponse({ status: "ready", paragraphs: ["Übersetzung"], provider: "gemini" }, 200);
    const result = await getChapterTranslation(1342, 0, "de");
    const url: string = (global.fetch as jest.Mock).mock.calls[0][0];
    expect(url).toContain("/books/1342/chapters/0/translation");
    expect(url).toContain("target_language=de");
    expect((global.fetch as jest.Mock).mock.calls[0][1]?.method).toBeUndefined(); // GET (default)
    expect(result.status).toBe("ready");
    expect(result.paragraphs).toEqual(["Übersetzung"]);
  });

  it("throws ApiError(404) when translation is not cached", async () => {
    mockResponse({ detail: "Translation not cached" }, 404);
    await expect(getChapterTranslation(1342, 0, "fr")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("saveGeminiKey — key management", () => {
  it("sends PUT request with key in body", async () => {
    mockResponse({}, 200);
    await saveGeminiKey("AIza-my-key");
    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("/user/gemini-key");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toMatchObject({ api_key: "AIza-my-key" });
  });

  it("throws on 403 (e.g. key validation failure)", async () => {
    mockResponse({ detail: "Invalid key" }, 403);
    await expect(saveGeminiKey("bad")).rejects.toMatchObject({ status: 403 });
  });
});
