CREATE TABLE IF NOT EXISTS "schema_migrations" (version varchar(128) primary key);
CREATE TABLE devices (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vendor TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  url TEXT,
  width_mm REAL NOT NULL,
  length_mm REAL NOT NULL,
  thickness_mm REAL NOT NULL DEFAULT 1.6,
  corner_radius_mm REAL NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#1d5c3a',
  silk_color TEXT NOT NULL DEFAULT '#f4f4f0',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE parts (
  device TEXT NOT NULL REFERENCES devices (slug) ON DELETE CASCADE ON UPDATE CASCADE,
  key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pin', 'component')),
  shape TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  group_name TEXT,
  side TEXT NOT NULL DEFAULT 'top' CHECK (side IN ('top', 'bottom')),
  x REAL NOT NULL,
  y REAL NOT NULL,
  w REAL NOT NULL,
  l REAL NOT NULL,
  h REAL NOT NULL DEFAULT 0,
  rotation REAL NOT NULL DEFAULT 0,
  props TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(props)),
  sort INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device, key)
);
CREATE TABLE function_categories (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE pin_functions (
  device TEXT NOT NULL,
  part TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL REFERENCES function_categories (key) ON UPDATE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device, part, name),
  FOREIGN KEY (device, part) REFERENCES parts (device, key) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE spec_keys (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  group_name TEXT NOT NULL,
  unit TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  hint TEXT NOT NULL DEFAULT ''
);
CREATE TABLE specs (
  device TEXT NOT NULL REFERENCES devices (slug) ON DELETE CASCADE ON UPDATE CASCADE,
  key TEXT NOT NULL REFERENCES spec_keys (key) ON UPDATE CASCADE,
  value TEXT NOT NULL,
  num REAL,
  PRIMARY KEY (device, key)
);
CREATE TABLE markings (
  device TEXT NOT NULL REFERENCES devices (slug) ON DELETE CASCADE ON UPDATE CASCADE,
  side TEXT NOT NULL DEFAULT 'top' CHECK (side IN ('top', 'bottom')),
  text TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  size REAL NOT NULL DEFAULT 1,
  rotation REAL NOT NULL DEFAULT 0
, align TEXT NOT NULL DEFAULT 'center' CHECK (align IN ('start', 'center', 'end')));
-- Dbmate schema migrations
INSERT INTO "schema_migrations" (version) VALUES
  ('20261012000000'),
  ('20261012102922');
