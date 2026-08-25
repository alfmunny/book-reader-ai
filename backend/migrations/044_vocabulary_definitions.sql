-- Store each word's meaning alongside the entry (#2704).
--
-- The vocabulary held no meaning at all: the list showed only occurrences, and
-- the reader's tooltip re-ran a dictionary lookup (Wiktionary, then an AI
-- fallback) on every single click — including for words already saved. The
-- meaning is now captured once at save time and rendered from here.
--
-- Purely additive and nullable, so no cleanup step is required by the migration
-- policy: existing rows keep NULL and are backfilled lazily the next time a live
-- lookup happens for that word.
--
--   definitions     JSON array of {pos, text}, as returned by services.wiktionary
--   form_of         e.g. "past participle of gehen"; NULL when the word is a base form
--   definition_url  canonical Wiktionary link; empty string for AI-sourced results
--   definition_lang the language the meaning is *written in*, not the word's own
--                   language. Definitions can be looked up in any language, so a
--                   stored meaning has to say which one it is — otherwise switching
--                   the dictionary language would serve a stale English definition
--                   from the DB and never re-fetch.

ALTER TABLE vocabulary ADD COLUMN definitions TEXT;
ALTER TABLE vocabulary ADD COLUMN form_of TEXT;
ALTER TABLE vocabulary ADD COLUMN definition_url TEXT;
ALTER TABLE vocabulary ADD COLUMN definition_lang TEXT;
