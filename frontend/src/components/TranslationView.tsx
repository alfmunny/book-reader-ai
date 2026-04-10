"use client";

interface Props {
  paragraphs: string[];
  translations: string[];
  displayMode: "parallel" | "inline";
  loading: boolean;
}

export default function TranslationView({ paragraphs, translations, displayMode, loading }: Props) {
  if (displayMode === "parallel") {
    return (
      <div className="grid grid-cols-2 gap-6 max-w-5xl mx-auto">
        {/* Original column */}
        <div className="space-y-4">
          {paragraphs.map((para, i) => (
            <p key={i} className="font-serif text-base text-ink leading-relaxed whitespace-pre-wrap">{para}</p>
          ))}
        </div>
        {/* Translation column */}
        <div className="space-y-4 border-l border-amber-200 pl-6">
          {loading && paragraphs.length > 0 && (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={`h-3 bg-amber-100 rounded ${i % 4 === 3 ? "w-2/3" : "w-full"}`} />
              ))}
            </div>
          )}
          {translations.map((trans, i) => (
            <p key={i} className="font-serif text-base text-amber-800 leading-relaxed italic whitespace-pre-wrap">{trans}</p>
          ))}
        </div>
      </div>
    );
  }

  // inline mode: original paragraph then translation beneath
  return (
    <div className="prose-reader mx-auto space-y-6">
      {paragraphs.map((para, i) => (
        <div key={i}>
          <p className="font-serif text-base text-ink leading-relaxed whitespace-pre-wrap">{para}</p>
          {loading && i === 0 && !translations.length && (
            <div className="mt-1 space-y-1 animate-pulse">
              <div className="h-3 bg-amber-100 rounded w-full" />
              <div className="h-3 bg-amber-100 rounded w-5/6" />
            </div>
          )}
          {translations[i] && (
            <p className="mt-1 font-serif text-sm text-amber-700 italic border-l-2 border-amber-300 pl-3 whitespace-pre-wrap">
              {translations[i]}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
