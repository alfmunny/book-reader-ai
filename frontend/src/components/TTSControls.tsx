"use client";
import { useEffect, useRef, useState } from "react";
import { synthesizeSpeech } from "@/lib/api";

interface Props {
  text: string;
  language: string;
}

export default function TTSControls({ text, language }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [rate, setRate] = useState(1.0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Incremented on every stop/play — lets an in-flight play() detect it was cancelled
  const genRef = useRef(0);

  useEffect(() => { stopAudio(); }, [text, language]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopAudio(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function stopAudio() {
    genRef.current++;                          // invalidate any in-flight play()
    abortRef.current?.abort();                 // cancel the fetch
    abortRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    window.speechSynthesis.cancel();           // stop fallback TTS if it was used
    setStatus("idle");
  }

  async function play() {
    stopAudio();
    const gen = ++genRef.current;
    const abort = new AbortController();
    abortRef.current = abort;
    setStatus("loading");

    try {
      // Pass signal so the fetch is cancelled when stop is clicked
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/ai/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language, rate }),
        signal: abort.signal,
      });
      if (!res.ok) throw new Error("TTS failed");
      const blob = await res.blob();

      // Bail out if stop was pressed while we were fetching
      if (gen !== genRef.current) return;

      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.playbackRate = rate;
      audio.onended = () => { if (gen === genRef.current) setStatus("idle"); };
      audio.onerror = () => { if (gen === genRef.current) setStatus("idle"); };
      await audio.play();
      if (gen === genRef.current) setStatus("playing");
    } catch (e: unknown) {
      if (gen !== genRef.current) return;
      if (e instanceof Error && e.name === "AbortError") return;
      // Fallback to Web Speech API
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = language;
      utter.rate = rate;
      utter.onend = () => { if (gen === genRef.current) setStatus("idle"); };
      window.speechSynthesis.speak(utter);
      if (gen === genRef.current) setStatus("playing");
    }
  }

  function pause() {
    audioRef.current?.pause();
    window.speechSynthesis.pause();
    setStatus("paused");
  }

  function resume() {
    if (audioRef.current) {
      audioRef.current.play();
    } else {
      window.speechSynthesis.resume();
    }
    setStatus("playing");
  }

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-white border-t border-amber-200">
      <div className="flex gap-1">
        {status === "loading" ? (
          <button
            onClick={stopAudio}
            className="rounded-lg bg-amber-700 text-white px-4 py-1.5 text-sm hover:bg-amber-800 flex items-center gap-2"
          >
            <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Preparing… ×
          </button>
        ) : status === "playing" ? (
          <button onClick={pause} className="rounded-lg bg-amber-200 text-amber-900 px-4 py-1.5 text-sm hover:bg-amber-300">
            ⏸ Pause
          </button>
        ) : status === "paused" ? (
          <button onClick={resume} className="rounded-lg bg-amber-700 text-white px-4 py-1.5 text-sm hover:bg-amber-800">
            ▶ Resume
          </button>
        ) : (
          <button onClick={play} className="rounded-lg bg-amber-700 text-white px-4 py-1.5 text-sm hover:bg-amber-800">
            ▶ Read
          </button>
        )}

        {status !== "idle" && (
          <button
            onClick={stopAudio}
            className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100"
          >
            ⏹
          </button>
        )}
      </div>

      <label className="flex items-center gap-1 text-xs text-amber-800">
        Speed
        <input
          type="range" min="0.5" max="2" step="0.1"
          value={rate}
          onChange={(e) => {
            const v = Number(e.target.value);
            setRate(v);
            if (audioRef.current) audioRef.current.playbackRate = v;
          }}
          className="w-20 accent-amber-700"
        />
        <span>{rate.toFixed(1)}×</span>
      </label>
    </div>
  );
}
