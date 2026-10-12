-- migrate:up
-- Horizontal anchor of a marking's text, in its reading direction:
-- 'start' = text begins at (x, y), 'end' = text ends at (x, y).
ALTER TABLE markings ADD COLUMN align TEXT NOT NULL DEFAULT 'center' CHECK (align IN ('start', 'center', 'end'));

-- migrate:down
ALTER TABLE markings DROP COLUMN align;
