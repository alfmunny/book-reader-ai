"use client";
import React, { useEffect, useRef } from "react";
import { FontSize, LineHeight, ContentWidth, FontFamily, saveSettings } from "@/lib/settings";

interface Props {
  fontSize: FontSize;
  lineHeight: LineHeight;
  contentWidth: ContentWidth;
  fontFamily: FontFamily;
  paragraphFocus: boolean;
  onFontSize: (v: FontSize) => void;
  onLineHeight: (v: LineHeight) => void;
  onContentWidth: (v: ContentWidth) => void;
  onFontFamily: (v: FontFamily) => void;
  onParagraphFocus: (v: boolean) => void;
  onClose: () => void;
  /** When provided, panel renders as position:fixed anchored to this point. */
  anchorPos?: { x: number; y: number };
}

type Option<T> = { value: T; label: string };

const FONT_SIZES: Option<FontSize>[] = [
  { value: "sm", label: "S" },
  { value: "base", label: "M" },
  { value: "lg", label: "L" },
  { value: "xl", label: "XL" },
];

const LINE_HEIGHTS: Option<LineHeight>[] = [
  { value: "tight", label: "Tight" },
  { value: "normal", label: "Normal" },
  { value: "relaxed", label: "Relaxed" },
];

const CONTENT_WIDTHS: Option<ContentWidth>[] = [
  { value: "narrow", label: "Narrow" },
  { value: "normal", label: "Normal" },
  { value: "wide", label: "Wide" },
];

const FONT_FAMILIES: Option<FontFamily>[] = [
  { value: "serif", label: "Serif" },
  { value: "sans", label: "Sans" },
];

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-lg border border-amber-200 overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`flex-1 px-2 py-1.5 min-h-[44px] text-xs font-medium transition-colors flex items-center justify-center ${
            value === opt.value
              ? "bg-amber-700 text-white"
              : "bg-white text-amber-700 hover:bg-amber-50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function TypographyPanel({
  fontSize,
  lineHeight,
  contentWidth,
  fontFamily,
  paragraphFocus,
  onFontSize,
  onLineHeight,
  onContentWidth,
  onFontFamily,
  onParagraphFocus,
  onClose,
  anchorPos,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  function set<T extends string>(setter: (v: T) => void, key: keyof Parameters<typeof saveSettings>[0]) {
    return (v: T) => {
      setter(v);
      saveSettings({ [key]: v } as Parameters<typeof saveSettings>[0]);
    };
  }

  const fixedStyle: React.CSSProperties = anchorPos
    ? {
        position: "fixed",
        top: anchorPos.y + 4,
        left: Math.max(8, Math.min(anchorPos.x - 256, window.innerWidth - 264)),
        zIndex: 1000,
      }
    : {};

  return (
    <div
      ref={panelRef}
      style={fixedStyle}
      className={`${anchorPos ? "" : "absolute top-full right-0 mt-1 z-50 "}bg-white border border-amber-200 rounded-xl shadow-lg p-4 w-64 animate-fade-in`}
      data-testid="typography-panel"
    >
      <div className="space-y-4">
        <Row label="Font size">
          <SegmentedControl
            label="Font size"
            options={FONT_SIZES}
            value={fontSize}
            onChange={set(onFontSize, "fontSize")}
          />
        </Row>
        <Row label="Font">
          <SegmentedControl
            label="Font family"
            options={FONT_FAMILIES}
            value={fontFamily}
            onChange={set(onFontFamily, "fontFamily")}
          />
        </Row>
        <Row label="Spacing">
          <SegmentedControl
            label="Line spacing"
            options={LINE_HEIGHTS}
            value={lineHeight}
            onChange={set(onLineHeight, "lineHeight")}
          />
        </Row>
        <Row label="Width">
          <SegmentedControl
            label="Content width"
            options={CONTENT_WIDTHS}
            value={contentWidth}
            onChange={set(onContentWidth, "contentWidth")}
          />
        </Row>
        <div className="flex items-center justify-between pt-1 border-t border-amber-100">
          <span className="text-xs text-stone-600">Paragraph focus</span>
          <button
            onClick={() => {
              const next = !paragraphFocus;
              onParagraphFocus(next);
              saveSettings({ paragraphFocus: next });
            }}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center -mr-1.5"
            role="switch"
            aria-label="Paragraph focus"
            aria-checked={paragraphFocus}
          >
            <span
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                paragraphFocus ? "bg-amber-700" : "bg-stone-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  paragraphFocus ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs text-stone-500 font-medium">{label}</span>
      {children}
    </div>
  );
}
