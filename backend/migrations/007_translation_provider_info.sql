-- Record the provider + model that produced each cached translation so the
-- reader can show "via gemini-3.1-flash" / "via google-translate" accordingly.

ALTER TABLE translations ADD COLUMN provider TEXT;
ALTER TABLE translations ADD COLUMN model TEXT;
