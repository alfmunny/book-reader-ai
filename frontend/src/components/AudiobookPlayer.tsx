"use client";
import { useEffect, useRef, useState } from "react";
import { Audiobook, AudioSection } from "@/lib/api";
import { detectContentStart } from "@/lib/audioUtils";

interface Props {
  audiobook: Audiobook;
  chapterIndex: number;
  onChapterChange: (i: number) => void;
  onUnlink: () => void;
  // Callbacks — all times are *effective* (disclaimer stripped)
  onTimeUpdate?: (t: number) => void;
  onDurationChange?: (d: number) => void;
  onPlayStateChange?: (playing: boolean) => void;
  // Parent calls this ref with an *effective* time to seek + auto-play
  seekRef?: React.MutableRefObject<(t: number) => void>;
}

function fmt(secs: number): string {
  if (!isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AudiobookPlayer({
  audiobook,
  chapterIndex,
  onChapterChange,
  onUnlink,
  onTimeUpdate,
  onDurationChange,
  onPlayStateChange,
  seekRef,
}: Props) {
  const sections = audiobook.sections;
  const sectionIndex = Math.min(chapterIndex, sections.length - 1);
  const [activeSec, setActiveSec] = useState(sectionIndex);
  const section: AudioSection | undefined = sections[activeSec];

  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [loading, setLoading] = useState(false);
  const [audioError, setAudioError] = useState("");

  // contentStart: null = detecting, number = detected (0 means no disclaimer gap found)
  const [contentStart, setContentStart] = useState<number | null>(null);
  const cs = contentStart ?? 0; // effective start in raw audio time

  // Keep active section in sync when chapter changes from the reader
  useEffect(() => {
    const idx = Math.min(chapterIndex, sections.length - 1);
    setActiveSec(idx);
  }, [chapterIndex, sections.length]);

  // Reset player when section changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setAudioError("");
    setContentStart(null); // will re-detect
    audio.load();
  }, [activeSec]);

  // Auto-detect disclaimer length when section URL is available
  useEffect(() => {
    if (!section?.url) return;
    setContentStart(null);
    detectContentStart(section.url).then(setContentStart);
  }, [section?.url]);

  // Apply playback rate
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  // Expose seek function — caller passes effective time
  if (seekRef) {
    seekRef.current = (effectiveT: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = effectiveT + cs;
      audio.play().catch(() => {});
      setPlaying(true);
      onPlayStateChange?.(true);
    };
  }

  function switchSection(idx: number) {
    setActiveSec(idx);
    onChapterChange(idx);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      setAudioError("");
      // Start from contentStart if we haven't moved yet
      if (audio.currentTime < cs) audio.currentTime = cs;
      audio.play().catch((e) => setAudioError(e.message));
      setPlaying(true);
    }
  }

  // Seek via scrubber — value is effective time (0-based from content start)
  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const effectiveT = Number(e.target.value);
    const rawT = effectiveT + cs;
    setCurrentTime(rawT);
    if (audioRef.current) audioRef.current.currentTime = rawT;
  }

  function skip(secs: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(cs, Math.min(duration, audio.currentTime + secs));
  }

  function onEnded() {
    setPlaying(false);
    if (activeSec < sections.length - 1) {
      switchSection(activeSec + 1);
      setTimeout(() => {
        audioRef.current?.play().catch(() => {});
        setPlaying(true);
      }, 300);
    }
  }

  // Effective (disclaimer-stripped) values for display and callbacks
  const effectiveTime = Math.max(0, currentTime - cs);
  const effectiveDuration = Math.max(0, duration - cs);

  return (
    <div className="border-t border-amber-200 bg-amber-50/60 shrink-0">
      {section?.url && (
        <audio
          ref={audioRef}
          src={section.url}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime;
            setCurrentTime(t);
            onTimeUpdate?.(Math.max(0, t - cs));
          }}
          onDurationChange={(e) => {
            const d = e.currentTarget.duration;
            setDuration(d);
            onDurationChange?.(Math.max(0, d - cs));
          }}
          onWaiting={() => setLoading(true)}
          onCanPlay={() => setLoading(false)}
          onEnded={onEnded}
          onError={() => {
            setAudioError("Could not load audio. The file may be unavailable.");
            setPlaying(false);
            setLoading(false);
            onPlayStateChange?.(false);
          }}
          onPlay={() => { setPlaying(true); onPlayStateChange?.(true); }}
          onPause={() => setPlaying(false)}
          preload="metadata"
        />
      )}

      <div className="px-3 py-2.5 space-y-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🎧</span>
              <span className="text-xs font-semibold text-ink truncate">
                {audiobook.title}
              </span>
              {contentStart === null && (
                <span className="text-xs text-amber-400 animate-pulse">syncing…</span>
              )}
              {contentStart !== null && cs > 0 && (
                <span className="text-xs text-amber-400" title="Disclaimer skipped">
                  +{cs.toFixed(0)}s skipped
                </span>
              )}
            </div>
            {audiobook.authors.length > 0 && (
              <p className="text-xs text-amber-600 truncate mt-0.5 pl-5">
                {audiobook.authors.join(", ")}
              </p>
            )}
          </div>
          <button
            onClick={onUnlink}
            title="Unlink audiobook"
            className="shrink-0 text-xs text-amber-400 hover:text-red-500 transition-colors mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Section selector */}
        <select
          className="w-full text-xs rounded border border-amber-300 px-2 py-1 text-ink bg-white"
          value={activeSec}
          onChange={(e) => switchSection(Number(e.target.value))}
        >
          {sections.map((s, i) => (
            <option key={i} value={i}>
              {i + 1}. {s.title || `Section ${i + 1}`}
              {s.duration ? ` (${s.duration})` : ""}
            </option>
          ))}
        </select>

        {/* Progress bar — range is 0..effectiveDuration */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-amber-600 w-8 shrink-0">{fmt(effectiveTime)}</span>
          <input
            type="range"
            min={0}
            max={effectiveDuration || 0}
            step={1}
            value={effectiveTime}
            onChange={seek}
            disabled={contentStart === null}
            className="flex-1 accent-amber-700 h-1.5 cursor-pointer disabled:opacity-40"
          />
          <span className="text-xs text-amber-600 w-8 text-right shrink-0">{fmt(effectiveDuration)}</span>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => skip(-15)}
            title="Back 15s"
            className="text-amber-700 hover:text-amber-900 text-sm px-1"
          >
            ↺<span className="text-xs">15</span>
          </button>

          <button
            onClick={togglePlay}
            disabled={!section?.url || contentStart === null}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-40 shrink-0 text-base"
          >
            {loading || contentStart === null ? (
              <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : playing ? (
              "⏸"
            ) : (
              "▶"
            )}
          </button>

          <button
            onClick={() => skip(15)}
            title="Forward 15s"
            className="text-amber-700 hover:text-amber-900 text-sm px-1"
          >
            ↻<span className="text-xs">15</span>
          </button>

          <button
            onClick={() => switchSection(Math.max(0, activeSec - 1))}
            disabled={activeSec === 0}
            className="ml-auto text-amber-600 hover:text-amber-900 disabled:opacity-30 text-sm px-1"
            title="Previous section"
          >
            ‹
          </button>

          <select
            className="text-xs rounded border border-amber-300 px-1 py-0.5 text-ink bg-white"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
              <option key={r} value={r}>{r}×</option>
            ))}
          </select>

          <button
            onClick={() => switchSection(Math.min(sections.length - 1, activeSec + 1))}
            disabled={activeSec === sections.length - 1}
            className="text-amber-600 hover:text-amber-900 disabled:opacity-30 text-sm px-1"
            title="Next section"
          >
            ›
          </button>
        </div>

        {audioError && (
          <p className="text-xs text-red-500">{audioError}</p>
        )}
      </div>
    </div>
  );
}
