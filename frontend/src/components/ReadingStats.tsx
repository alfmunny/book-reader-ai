"use client";
import { useEffect, useState } from "react";
import { getUserStats, UserStats } from "@/lib/api";
import { BookOpenIcon, NoteIcon, InsightIcon, VocabIcon, FireIcon } from "@/components/Icons";

// Build a 365-day grid (52 weeks × 7 days) aligned to Sunday columns.
function buildGrid(activity: { date: string; count: number }[]): {
  weeks: { date: string; count: number }[][];
  months: { label: string; colStart: number }[];
} {
  const countMap = new Map(activity.map((a) => [a.date, a.count]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start from the Sunday 52 weeks before today
  const start = new Date(today);
  start.setDate(start.getDate() - 364 - start.getDay()); // align to Sunday

  const weeks: { date: string; count: number }[][] = [];
  let current = new Date(start);
  let week: { date: string; count: number }[] = [];
  const months: { label: string; colStart: number }[] = [];
  let lastMonth = -1;
  let weekIndex = 0;

  while (current <= today) {
    const iso = current.toISOString().slice(0, 10);
    const month = current.getMonth();
    if (month !== lastMonth) {
      months.push({
        label: current.toLocaleString("default", { month: "short" }),
        colStart: weekIndex,
      });
      lastMonth = month;
    }
    week.push({ date: iso, count: countMap.get(iso) ?? 0 });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
      weekIndex++;
    }
    current.setDate(current.getDate() + 1);
  }
  if (week.length > 0) {
    // Pad the last partial week with empty days
    while (week.length < 7) week.push({ date: "", count: 0 });
    weeks.push(week);
  }
  return { weeks, months };
}

function intensityClass(count: number): string {
  if (count === 0) return "bg-stone-100";
  if (count <= 2) return "bg-amber-200";
  if (count <= 5) return "bg-amber-400";
  if (count <= 10) return "bg-amber-600";
  return "bg-amber-800";
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
}

function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-amber-100 px-5 py-4 flex items-center gap-4">
      <span className="text-amber-600">{icon}</span>
      <div>
        <p className="text-2xl font-bold text-stone-800">{value.toLocaleString()}</p>
        <p className="text-xs text-stone-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

interface Props {
  /** If false, show a skeleton placeholder instead of fetching. */
  active: boolean;
  /** When true, renders only the activity heatmap (no streak banner or stat cards). */
  heatmapOnly?: boolean;
}

export default function ReadingStats({ active, heatmapOnly = false }: Props) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!active) return;
    getUserStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [active]);

  if (!active || (loading && !stats)) {
    return (
      <div role="status" aria-label="Loading reading stats" className="space-y-4 animate-pulse">
        {!heatmapOnly && (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-amber-50 rounded-xl border border-amber-100" />
            ))}
          </div>
        )}
        <div className="h-28 bg-amber-50 rounded-xl border border-amber-100" />
      </div>
    );
  }

  if (!stats) return null;

  const { weeks, months } = buildGrid(stats.activity);
  const activeDays = stats.activity.filter((a) => a.count > 0).length;

  return (
    <div className="space-y-5">
      {!heatmapOnly && (
        <>
          {/* Streak banner */}
          {stats.streak > 0 && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
              <FireIcon className="w-6 h-6 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  {stats.streak}-day reading streak!
                </p>
                <p className="text-xs text-amber-600">
                  Longest: {stats.longest_streak} days
                </p>
              </div>
            </div>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Books started" value={stats.totals.books_started} icon={<BookOpenIcon className="w-5 h-5" />} />
            <StatCard label="Words saved" value={stats.totals.vocabulary_words} icon={<VocabIcon className="w-5 h-5" />} />
            <StatCard label="Annotations" value={stats.totals.annotations} icon={<NoteIcon className="w-5 h-5" />} />
            <StatCard label="Insights" value={stats.totals.insights} icon={<InsightIcon className="w-5 h-5" />} />
          </div>
        </>
      )}

      {/* Activity heatmap */}
      <div
        role="img"
        aria-label={`Reading activity heatmap: ${activeDays} active ${activeDays === 1 ? "day" : "days"} in the last year`}
        className="bg-white border border-amber-100 rounded-xl p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-stone-700">Activity — last year</p>
          <p className="text-xs text-stone-400">
            {activeDays} active {activeDays === 1 ? "day" : "days"}
          </p>
        </div>

        {/* Month labels */}
        <div
          className="grid mb-1"
          style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
        >
          {weeks.map((_, wi) => {
            const m = months.find((m) => m.colStart === wi);
            return (
              <div key={wi} className="text-[9px] text-stone-400 truncate">
                {m?.label ?? ""}
              </div>
            );
          })}
        </div>

        {/* Grid: columns = weeks, rows = days (Sun–Sat) */}
        <div
          className="grid gap-[2px]"
          style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
        >
          {[0, 1, 2, 3, 4, 5, 6].map((dow) => (
            <div
              key={dow}
              className="contents"
              style={{ gridRow: dow + 1 }}
            >
              {weeks.map((week, wi) => {
                const cell = week[dow];
                return (
                  <div
                    key={`${wi}-${dow}`}
                    title={cell.date ? `${cell.date}: ${cell.count} event${cell.count !== 1 ? "s" : ""}` : ""}
                    className={`rounded-[2px] aspect-square ${cell.date ? intensityClass(cell.count) : "bg-transparent"}`}
                    style={{ gridColumn: wi + 1, gridRow: dow + 1 }}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1 mt-2 justify-end">
          <span className="text-[9px] text-stone-400 mr-1">Less</span>
          {["bg-stone-100", "bg-amber-200", "bg-amber-400", "bg-amber-600", "bg-amber-800"].map((c) => (
            <div key={c} className={`w-3 h-3 rounded-[2px] ${c}`} />
          ))}
          <span className="text-[9px] text-stone-400 ml-1">More</span>
        </div>
      </div>
    </div>
  );
}
