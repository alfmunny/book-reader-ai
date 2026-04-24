"use client";
import { useState, useEffect, useRef, KeyboardEvent } from "react";
import {
  addVocabularyWordTag,
  removeVocabularyWordTag,
  getVocabularyWordTags,
  ApiError,
} from "@/lib/api";
import { CloseIcon } from "@/components/Icons";

interface TagEditorProps {
  vocabularyId: number;
  initialTags?: string[];
  onTagsChange?: (tags: string[]) => void;
}

export default function TagEditor({
  vocabularyId,
  initialTags,
  onTagsChange,
}: TagEditorProps) {
  const [tags, setTags] = useState<string[]>(initialTags ?? []);
  const [loaded, setLoaded] = useState(initialTags !== undefined);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (loaded) return;
    let alive = true;
    getVocabularyWordTags(vocabularyId)
      .then((list) => {
        if (!alive) return;
        setTags(list);
        onTagsChange?.(list);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [vocabularyId, loaded, onTagsChange]);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  async function submitTag() {
    if (submittingRef.current) return;
    const raw = draft.trim();
    if (!raw) {
      setAdding(false);
      setDraft("");
      return;
    }
    if (raw.length > 50) {
      setError("Tag is too long (max 50 chars).");
      return;
    }
    submittingRef.current = true;
    setError(null);
    try {
      const { tag } = await addVocabularyWordTag(vocabularyId, raw);
      const next = tags.includes(tag) ? tags : [...tags, tag].sort();
      setTags(next);
      onTagsChange?.(next);
      setDraft("");
      setAdding(false);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError("Failed to add tag.");
      }
    } finally {
      submittingRef.current = false;
    }
  }

  async function handleRemove(tag: string) {
    setBusy(tag);
    setError(null);
    try {
      await removeVocabularyWordTag(vocabularyId, tag);
      const next = tags.filter((t) => t !== tag);
      setTags(next);
      onTagsChange?.(next);
    } catch {
      setError("Failed to remove tag.");
    } finally {
      setBusy(null);
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submitTag();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setAdding(false);
      setDraft("");
      setError(null);
    }
  }

  return (
    <div
      className="flex items-center gap-1.5 flex-wrap"
      data-testid={`tag-editor-${vocabularyId}`}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 pl-2 pr-1 py-0.5 text-xs text-amber-800"
          data-testid={`tag-chip-${tag}`}
        >
          <span>{tag}</span>
          <button
            type="button"
            onClick={() => handleRemove(tag)}
            disabled={busy === tag}
            aria-label={`Remove tag ${tag}`}
            className="rounded-full p-0.5 hover:bg-amber-100 disabled:opacity-50 transition-colors"
          >
            <CloseIcon className="w-3 h-3" />
          </button>
        </span>
      ))}

      {adding ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={submitTag}
          maxLength={50}
          placeholder="new tag"
          aria-label="New tag"
          className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-amber-400 w-24"
          data-testid={`tag-input-${vocabularyId}`}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label="Add tag"
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-amber-300 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-50 transition-colors"
          data-testid={`add-tag-${vocabularyId}`}
        >
          <span aria-hidden="true">+</span>
          <span>tag</span>
        </button>
      )}

      {error && (
        <span className="text-xs text-red-600" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
