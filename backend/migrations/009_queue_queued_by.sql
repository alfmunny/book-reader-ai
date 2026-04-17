-- Track who (or what) put each item on the translation queue.
-- NULL = auto-enqueued by save_book(). Otherwise the admin's email.

ALTER TABLE translation_queue ADD COLUMN queued_by TEXT;
