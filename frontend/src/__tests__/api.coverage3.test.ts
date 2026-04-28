/**
 * Coverage tests for lib/api.ts — functions not covered by existing test files.
 * Closes #1981 — targets: searchInAppContent, generateChapterSummary, getUserStats,
 * vocab-tag crud, deck crud, upload helpers, flashcard queries, chat messages.
 */
import {
  setAuthToken,
  searchInAppContent,
  generateChapterSummary,
  getUserStats,
  listVocabularyTags,
  getVocabularyWordTags,
  addVocabularyWordTag,
  removeVocabularyWordTag,
  listDecks,
  getDeck,
  createDeck,
  deleteDeck,
  addDeckMember,
  removeDeckMember,
  uploadBook,
  getUploadQuota,
  getDraftChapters,
  confirmChapters,
  deleteUploadedBook,
  getDueFlashcards,
  reviewFlashcard,
  getFlashcardStats,
  getChatMessages,
  postChatMessage,
  clearChatMessages,
} from "@/lib/api";

function mockFetch(body: unknown, ok = true, status = ok ? 200 : 400) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? "OK" : "Bad Request",
    json: jest.fn().mockResolvedValue(body),
    headers: { get: jest.fn().mockReturnValue(null) },
  });
}

function fetchUrl(): string {
  return (global.fetch as jest.Mock).mock.calls[0][0] as string;
}

function fetchMethod(): string {
  return ((global.fetch as jest.Mock).mock.calls[0][1] as RequestInit)?.method ?? "GET";
}

function fetchBody(): unknown {
  const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
  return init?.body ? JSON.parse(init.body as string) : undefined;
}

beforeEach(() => {
  setAuthToken("test-token");
});

// ── searchInAppContent ────────────────────────────────────────────────────────

test("searchInAppContent builds correct URL with q and limit", async () => {
  mockFetch({ results: [] });
  await searchInAppContent("hello");
  expect(fetchUrl()).toMatch(/\/search\?/);
  expect(fetchUrl()).toContain("q=hello");
  expect(fetchUrl()).toContain("limit=20");
});

test("searchInAppContent includes scope when provided", async () => {
  mockFetch({ results: [] });
  await searchInAppContent("word", ["vocabulary", "annotations"]);
  expect(fetchUrl()).toContain("scope=vocabulary%2Cannotations");
});

test("searchInAppContent omits scope param when array is empty", async () => {
  mockFetch({ results: [] });
  await searchInAppContent("word", []);
  expect(fetchUrl()).not.toContain("scope=");
});

// ── generateChapterSummary ────────────────────────────────────────────────────

test("generateChapterSummary POSTs to /ai/summary with correct body", async () => {
  mockFetch({ summary: "A tale.", cached: false });
  await generateChapterSummary(1, 0, "Chapter text", "My Book", "Author");
  expect(fetchUrl()).toContain("/ai/summary");
  expect(fetchMethod()).toBe("POST");
  const body = fetchBody() as Record<string, unknown>;
  expect(body.book_id).toBe(1);
  expect(body.chapter_index).toBe(0);
  expect(body.chapter_text).toBe("Chapter text");
  expect(body.book_title).toBe("My Book");
  expect(body.author).toBe("Author");
});

test("generateChapterSummary includes chapter_title when provided", async () => {
  mockFetch({ summary: "summary", cached: true });
  await generateChapterSummary(2, 1, "text", "Book", "Auth", "Prologue");
  const body = fetchBody() as Record<string, unknown>;
  expect(body.chapter_title).toBe("Prologue");
});

// ── getUserStats ──────────────────────────────────────────────────────────────

test("getUserStats calls /user/stats", async () => {
  mockFetch({ total_books: 5 });
  await getUserStats();
  expect(fetchUrl()).toContain("/user/stats");
});

// ── Vocabulary tag CRUD ───────────────────────────────────────────────────────

test("listVocabularyTags calls /vocabulary/tags", async () => {
  mockFetch([]);
  await listVocabularyTags();
  expect(fetchUrl()).toContain("/vocabulary/tags");
});

test("getVocabularyWordTags calls /vocabulary/:id/tags", async () => {
  mockFetch([]);
  await getVocabularyWordTags(42);
  expect(fetchUrl()).toContain("/vocabulary/42/tags");
});

test("addVocabularyWordTag POSTs tag to /vocabulary/:id/tags", async () => {
  mockFetch({ tag: "noun" });
  await addVocabularyWordTag(7, "noun");
  expect(fetchUrl()).toContain("/vocabulary/7/tags");
  expect(fetchMethod()).toBe("POST");
  const body = fetchBody() as Record<string, unknown>;
  expect(body.tag).toBe("noun");
});

test("removeVocabularyWordTag DELETEs the correct URL with encoded tag", async () => {
  mockFetch(null);
  await removeVocabularyWordTag(7, "food & drink");
  expect(fetchMethod()).toBe("DELETE");
  expect(fetchUrl()).toContain("/vocabulary/7/tags/food%20%26%20drink");
});

// ── Deck CRUD ─────────────────────────────────────────────────────────────────

test("listDecks calls /decks", async () => {
  mockFetch([]);
  await listDecks();
  expect(fetchUrl()).toContain("/decks");
});

test("getDeck calls /decks/:id", async () => {
  mockFetch({ id: 3 });
  await getDeck(3);
  expect(fetchUrl()).toContain("/decks/3");
});

test("createDeck POSTs to /decks with payload", async () => {
  mockFetch({ id: 5, name: "New Deck" });
  await createDeck({ name: "New Deck", mode: "manual" });
  expect(fetchUrl()).toContain("/decks");
  expect(fetchMethod()).toBe("POST");
  const body = fetchBody() as Record<string, unknown>;
  expect(body.name).toBe("New Deck");
  expect(body.mode).toBe("manual");
});

test("deleteDeck DELETEs /decks/:id", async () => {
  mockFetch(null);
  await deleteDeck(9);
  expect(fetchUrl()).toContain("/decks/9");
  expect(fetchMethod()).toBe("DELETE");
});

test("addDeckMember POSTs to /decks/:deckId/members", async () => {
  mockFetch({ vocabulary_id: 11 });
  await addDeckMember(2, 11);
  expect(fetchUrl()).toContain("/decks/2/members");
  expect(fetchMethod()).toBe("POST");
  const body = fetchBody() as Record<string, unknown>;
  expect(body.vocabulary_id).toBe(11);
});

test("removeDeckMember DELETEs /decks/:deckId/members/:vocabId", async () => {
  mockFetch(null);
  await removeDeckMember(2, 11);
  expect(fetchUrl()).toContain("/decks/2/members/11");
  expect(fetchMethod()).toBe("DELETE");
});

// ── Upload helpers ────────────────────────────────────────────────────────────

test("uploadBook POSTs FormData to /books/upload", async () => {
  mockFetch({ book_id: 99, title: "Uploaded" });
  const file = new File(["content"], "book.txt", { type: "text/plain" });
  await uploadBook(file);
  expect(fetchUrl()).toContain("/books/upload");
  expect(fetchMethod()).toBe("POST");
  const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
  expect(init.body).toBeInstanceOf(FormData);
});

test("getUploadQuota calls /books/upload/quota", async () => {
  mockFetch({ used: 1, limit: 10 });
  await getUploadQuota();
  expect(fetchUrl()).toContain("/books/upload/quota");
});

test("getDraftChapters calls /books/:id/chapters/draft", async () => {
  mockFetch({ chapters: [] });
  await getDraftChapters(5);
  expect(fetchUrl()).toContain("/books/5/chapters/draft");
});

test("confirmChapters POSTs chapters to /books/:id/chapters/confirm", async () => {
  mockFetch({ ok: true, chapter_count: 3 });
  await confirmChapters(5, [{ title: "Ch 1", original_index: 0 }]);
  expect(fetchUrl()).toContain("/books/5/chapters/confirm");
  expect(fetchMethod()).toBe("POST");
  const body = fetchBody() as Record<string, unknown>;
  expect((body.chapters as unknown[]).length).toBe(1);
});

test("deleteUploadedBook DELETEs /books/upload/:id", async () => {
  mockFetch({ ok: true });
  await deleteUploadedBook(5);
  expect(fetchUrl()).toContain("/books/upload/5");
  expect(fetchMethod()).toBe("DELETE");
});

// ── Flashcard queries ─────────────────────────────────────────────────────────

test("getDueFlashcards calls /vocabulary/flashcards/due without deckId", async () => {
  mockFetch([]);
  await getDueFlashcards();
  expect(fetchUrl()).toContain("/vocabulary/flashcards/due");
  expect(fetchUrl()).not.toContain("deck_id");
});

test("getDueFlashcards appends deck_id query param when provided", async () => {
  mockFetch([]);
  await getDueFlashcards(3);
  expect(fetchUrl()).toContain("deck_id=3");
});

test("reviewFlashcard POSTs grade to /vocabulary/flashcards/:id/review", async () => {
  mockFetch({ vocabulary_id: 1, interval_days: 1 });
  await reviewFlashcard(1, 4);
  expect(fetchUrl()).toContain("/vocabulary/flashcards/1/review");
  expect(fetchMethod()).toBe("POST");
  const body = fetchBody() as Record<string, unknown>;
  expect(body.grade).toBe(4);
});

test("getFlashcardStats calls /vocabulary/flashcards/stats without deckId", async () => {
  mockFetch({ total: 5, due_today: 2, reviewed_today: 1 });
  await getFlashcardStats();
  expect(fetchUrl()).toContain("/vocabulary/flashcards/stats");
  expect(fetchUrl()).not.toContain("deck_id");
});

test("getFlashcardStats appends deck_id when provided", async () => {
  mockFetch({ total: 2, due_today: 1, reviewed_today: 0 });
  await getFlashcardStats(7);
  expect(fetchUrl()).toContain("deck_id=7");
});

// ── Chat messages ─────────────────────────────────────────────────────────────

test("getChatMessages calls /chat/:bookId/messages with limit", async () => {
  mockFetch({ messages: [], has_more: false });
  await getChatMessages(42);
  expect(fetchUrl()).toContain("/chat/42/messages");
  expect(fetchUrl()).toContain("limit=50");
});

test("getChatMessages includes before_id when provided", async () => {
  mockFetch({ messages: [], has_more: false });
  await getChatMessages("10", 20, 99);
  expect(fetchUrl()).toContain("before_id=99");
  expect(fetchUrl()).toContain("limit=20");
});

test("postChatMessage POSTs role and content to /chat/:bookId/messages", async () => {
  mockFetch({ id: 1, role: "user", content: "Hello", created_at: "" });
  await postChatMessage(3, "user", "Hello");
  expect(fetchUrl()).toContain("/chat/3/messages");
  expect(fetchMethod()).toBe("POST");
  const body = fetchBody() as Record<string, unknown>;
  expect(body.role).toBe("user");
  expect(body.content).toBe("Hello");
});

test("clearChatMessages DELETEs /chat/:bookId/messages", async () => {
  mockFetch({ deleted: 5 });
  await clearChatMessages(3);
  expect(fetchUrl()).toContain("/chat/3/messages");
  expect(fetchMethod()).toBe("DELETE");
});
