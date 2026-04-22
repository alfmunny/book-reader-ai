-- Add lemma (base/dictionary form) and language to vocabulary.
-- lemma is populated asynchronously by the Wiktionary lookup service.
ALTER TABLE vocabulary ADD COLUMN lemma TEXT;
ALTER TABLE vocabulary ADD COLUMN language TEXT;
