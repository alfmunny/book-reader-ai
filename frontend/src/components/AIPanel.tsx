"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getInsight, checkPronunciation, findVideos, VideoResult } from "@/lib/api";
import InsightDialog from "./InsightDialog";

type Mode = "insight" | "pronunciation" | "video";

interface Props {
  chapterText: string;
  selectedText: string;
  bookTitle: string;
  author: string;
  bookLanguage: string;
  spokenText?: string;
}

export default function AIPanel({
  chapterText,
  selectedText,
  bookTitle,
  author,
  bookLanguage,
  spokenText = "",
}: Props) {
  const [mode, setMode] = useState<Mode>("insight");

  // ── Insight ──────────────────────────────────────────────────────────────
  const [insightOpen, setInsightOpen] = useState(false);
  const [insight, setInsight] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  // Track which chapter we've fetched insight for
  const fetchedForText = useRef("");

  // Reset when chapter changes
  useEffect(() => {
    setInsight("");
    setInsightError("");
    setInsightLoading(false);
    setInsightOpen(false);
    setShowDialog(false);
    fetchedForText.current = "";
  }, [chapterText]);

  function toggleInsight() {
    const opening = !insightOpen;
    setInsightOpen(opening);
    // Fetch on first open for this chapter
    if (opening && !insight && !insightLoading && chapterText && bookTitle && fetchedForText.current !== chapterText) {
      fetchedForText.current = chapterText;
      setInsightLoading(true);
      setInsightError("");
      getInsight(chapterText, bookTitle, author, "en")
        .then((r) => setInsight(r.insight))
        .catch((e) => setInsightError(e.message))
        .finally(() => setInsightLoading(false));
    }
  }

  // ── Pronunciation ─────────────────────────────────────────────────────
  const [manualSpoken, setManualSpoken] = useState("");
  const [pronFeedback, setPronFeedback] = useState("");
  const [pronLoading, setPronLoading] = useState(false);

  async function runPronunciation() {
    const spoken = spokenText || manualSpoken;
    if (!spoken.trim() || !selectedText) return;
    setPronLoading(true);
    setPronFeedback("");
    try {
      const r = await checkPronunciation(selectedText, spoken, bookLanguage);
      setPronFeedback(r.feedback);
    } catch (e: any) {
      setPronFeedback(`Error: ${e.message}`);
    } finally {
      setPronLoading(false);
    }
  }

  // ── Videos ────────────────────────────────────────────────────────────
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [videoQuery, setVideoQuery] = useState("");
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState("");

  async function runVideos() {
    const text = selectedText || chapterText.slice(0, 400);
    setVideoLoading(true);
    setVideoError("");
    setVideos([]);
    setVideoQuery("");
    try {
      const r = await findVideos(text, bookTitle, author);
      setVideos(r.videos);
      setVideoQuery(r.query);
      if (r.videos.length === 0)
        setVideoError("No videos found. Configure your YouTube API key.");
    } catch (e: any) {
      setVideoError(e.message);
    } finally {
      setVideoLoading(false);
    }
  }

  const tabs: { id: Mode; label: string; icon: string }[] = [
    { id: "insight", label: "Insight", icon: "✨" },
    { id: "pronunciation", label: "Speak", icon: "🎙️" },
    { id: "video", label: "Video", icon: "🎬" },
  ];

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-amber-200 shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setMode(t.id)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                mode === t.id
                  ? "bg-amber-100 text-amber-900 border-b-2 border-amber-600"
                  : "text-amber-700 hover:bg-amber-50"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto flex flex-col">

          {/* ── INSIGHT ───────────────────────────────────────────────── */}
          {mode === "insight" && (
            <div className="flex flex-col">
              {/* Collapsible header */}
              <button
                onClick={toggleInsight}
                className="flex items-center justify-between px-4 py-3 text-left hover:bg-amber-50 transition-colors border-b border-amber-100"
              >
                <span className="font-serif font-semibold text-sm text-ink">Chapter Insights</span>
                <span className={`text-amber-600 text-xs transition-transform duration-200 ${insightOpen ? "rotate-180" : ""}`}>
                  ▼
                </span>
              </button>

              {insightOpen && (
                <div className="p-4 flex flex-col gap-3">
                  {insightLoading && (
                    <div className="space-y-2.5 animate-pulse">
                      <div className="h-3 bg-amber-100 rounded w-full" />
                      <div className="h-3 bg-amber-100 rounded w-5/6" />
                      <div className="h-3 bg-amber-100 rounded w-full" />
                      <div className="h-3 bg-amber-100 rounded w-4/6" />
                      <div className="h-3 bg-amber-100 rounded w-full" />
                      <div className="h-3 bg-amber-100 rounded w-3/4" />
                    </div>
                  )}

                  {insightError && (
                    <p className="text-red-500 text-xs">{insightError}</p>
                  )}

                  {insight && (
                    <>
                      <div className="prose prose-sm prose-headings:font-serif prose-headings:text-ink prose-headings:text-sm prose-p:text-ink prose-p:leading-relaxed prose-strong:text-amber-900 prose-em:text-amber-800 max-w-none font-serif text-sm text-ink">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{insight}</ReactMarkdown>
                      </div>

                      <button
                        onClick={() => setShowDialog(true)}
                        className="mt-1 w-full rounded-xl border border-amber-300 bg-amber-50 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-100 hover:border-amber-400 transition-colors"
                      >
                        Continue exploring →
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── PRONUNCIATION ─────────────────────────────────────────── */}
          {mode === "pronunciation" && (
            <div className="p-3 flex flex-col gap-3">
              <div className="rounded bg-amber-50 border border-amber-200 p-2 text-xs font-serif text-amber-900 line-clamp-3">
                {selectedText
                  ? `"${selectedText.slice(0, 200)}${selectedText.length > 200 ? "…" : ""}"`
                  : "Select text in the reader first"}
              </div>
              <textarea
                className="rounded border border-amber-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                rows={3}
                placeholder={
                  spokenText
                    ? `Recorded: "${spokenText.slice(0, 60)}…"`
                    : "Type what you said, or use the recorder below…"
                }
                value={manualSpoken}
                onChange={(e) => setManualSpoken(e.target.value)}
              />
              <button
                onClick={runPronunciation}
                disabled={pronLoading || (!spokenText && !manualSpoken) || !selectedText}
                className="rounded-lg bg-amber-700 py-2 text-white text-sm font-medium hover:bg-amber-800 disabled:opacity-40"
              >
                {pronLoading ? "Checking…" : "Check my reading"}
              </button>
              {pronFeedback && (
                <div className="prose prose-sm max-w-none font-serif text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{pronFeedback}</ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {/* ── VIDEO ─────────────────────────────────────────────────── */}
          {mode === "video" && (
            <div className="p-3 flex flex-col gap-3">
              <button
                onClick={runVideos}
                disabled={videoLoading}
                className="rounded-lg bg-amber-700 py-2 text-white text-sm font-medium hover:bg-amber-800 disabled:opacity-40"
              >
                {videoLoading ? "Searching…" : "Find performances for this chapter"}
              </button>
              {videoQuery && (
                <p className="text-xs text-amber-600">Search: "{videoQuery}"</p>
              )}
              {videoError && <p className="text-red-500 text-xs">{videoError}</p>}
              {videos.map((v) => (
                <a
                  key={v.id}
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-2 rounded-lg border border-amber-200 bg-white p-2 hover:bg-amber-50"
                >
                  <img
                    src={v.thumbnail}
                    alt={v.title}
                    className="w-24 h-14 object-cover rounded shrink-0"
                  />
                  <div className="flex flex-col justify-center min-w-0">
                    <p className="text-xs font-medium text-ink line-clamp-2">{v.title}</p>
                    <p className="text-xs text-amber-700 mt-0.5">{v.channel}</p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Insight dialog (rendered outside the panel's scroll container) */}
      {showDialog && (
        <InsightDialog
          insight={insight}
          chapterText={chapterText}
          selectedText={selectedText}
          bookTitle={bookTitle}
          author={author}
          onClose={() => setShowDialog(false)}
        />
      )}
    </>
  );
}
