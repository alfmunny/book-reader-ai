/**
 * Smoke-render every icon in components/Icons.tsx with no props (closes #2031).
 *
 * Istanbul tracks a `default-arg` branch for each icon's `className` default
 * parameter. All icon usages in the codebase pass `className` explicitly, so
 * the "use default value" path is never hit. Rendering with no props here
 * exercises all 50 default-arg branches and pushes Icons.tsx to ~100% branches.
 */
import React from "react";
import { render } from "@testing-library/react";
import {
  FireIcon,
  SpeakerIcon,
  ArrowRightIcon,
  HighlightIcon,
  NoteIcon,
  ChatIcon,
  BookOpenIcon,
  GlobeIcon,
  BookmarkIcon,
  PlayIcon,
  PauseIcon,
  CloseIcon,
  SunIcon,
  MoonIcon,
  SepiaIcon,
  ArrowLeftIcon,
  WordIcon,
  SummaryIcon,
  ExportIcon,
  EditIcon,
  TrashIcon,
  ChevronRightIcon,
  CheckIcon,
  CheckCircleIcon,
  RetryIcon,
  InsightIcon,
  VocabIcon,
  EmptyNotesIcon,
  BookCoverPlaceholderIcon,
  EmptyVocabIcon,
  EmptyUploadIcon,
  AlertCircleIcon,
  CircleDotIcon,
  PaperclipIcon,
  SaveIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  KeyboardIcon,
  FocusIcon,
  UploadIcon,
  FlashcardIcon,
  GridViewIcon,
  ListViewIcon,
  ArrowUpRightIcon,
  SearchIcon,
  SettingsIcon,
  DeckIcon,
  ClockIcon,
  ArrowUpIcon,
  PlusIcon,
} from "@/components/Icons";

const ALL_ICONS = [
  FireIcon, SpeakerIcon, ArrowRightIcon, HighlightIcon, NoteIcon,
  ChatIcon, BookOpenIcon, GlobeIcon, BookmarkIcon, PlayIcon,
  PauseIcon, CloseIcon, SunIcon, MoonIcon, SepiaIcon,
  ArrowLeftIcon, WordIcon, SummaryIcon, ExportIcon, EditIcon,
  TrashIcon, ChevronRightIcon, CheckIcon, CheckCircleIcon, RetryIcon,
  InsightIcon, VocabIcon, EmptyNotesIcon, BookCoverPlaceholderIcon, EmptyVocabIcon,
  EmptyUploadIcon, AlertCircleIcon, CircleDotIcon, PaperclipIcon, SaveIcon,
  ChevronDownIcon, ChevronUpIcon, KeyboardIcon, FocusIcon, UploadIcon,
  FlashcardIcon, GridViewIcon, ListViewIcon, ArrowUpRightIcon, SearchIcon,
  SettingsIcon, DeckIcon, ClockIcon, ArrowUpIcon, PlusIcon,
];

test.each(ALL_ICONS)("renders %s with default className (no props — hits default-arg branch)", (Icon) => {
  expect(() => render(<Icon />)).not.toThrow();
});
