-- migrate:up

-- A physical object we explain. For boards, the body is the PCB.
-- Geometry is in millimetres. Origin is the centre of the body, +x right,
-- +y towards the "top" edge as seen from above (usually the USB end).
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

-- Anything on the object you can click: pins/pads and components.
-- x, y: centre in the top-view frame (also for bottom-side parts).
-- w, l, h: size along x, y and height above (or below) the surface.
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

-- Signal names a pin carries: GPIO1, A0, SDA, LP_UART_TXD, ...
CREATE TABLE pin_functions (
  device TEXT NOT NULL,
  part TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL REFERENCES function_categories (key) ON UPDATE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device, part, name),
  FOREIGN KEY (device, part) REFERENCES parts (device, key) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Canonical spec rows, shared by all devices so they can be compared.
CREATE TABLE spec_keys (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  group_name TEXT NOT NULL,
  unit TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  hint TEXT NOT NULL DEFAULT ''
);

-- value: display text. num: the same value as a number in spec_keys.unit.
CREATE TABLE specs (
  device TEXT NOT NULL REFERENCES devices (slug) ON DELETE CASCADE ON UPDATE CASCADE,
  key TEXT NOT NULL REFERENCES spec_keys (key) ON UPDATE CASCADE,
  value TEXT NOT NULL,
  num REAL,
  PRIMARY KEY (device, key)
);

-- Silkscreen / printed text on the body surface.
CREATE TABLE markings (
  device TEXT NOT NULL REFERENCES devices (slug) ON DELETE CASCADE ON UPDATE CASCADE,
  side TEXT NOT NULL DEFAULT 'top' CHECK (side IN ('top', 'bottom')),
  text TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  size REAL NOT NULL DEFAULT 1,
  rotation REAL NOT NULL DEFAULT 0
);

INSERT INTO function_categories (key, label, color, sort) VALUES
  ('power', 'Power', '#e0362c', 10),
  ('gnd', 'Ground', '#1c1c1e', 20),
  ('gpio', 'GPIO', '#7d8197', 30),
  ('digital', 'Digital', '#5fb83a', 40),
  ('analog', 'Analog', '#ee8130', 50),
  ('i2c', 'I2C', '#6b5656', 60),
  ('uart', 'UART', '#3f9fd3', 70),
  ('spi', 'SPI', '#e9a23b', 80),
  ('sdio', 'SDIO', '#1f9e87', 90),
  ('usb', 'USB', '#2b62c9', 100),
  ('jtag', 'JTAG', '#4338a3', 110),
  ('lp', 'Low-power IO', '#e86aa8', 120),
  ('boot', 'Boot / strapping', '#93208a', 130),
  ('reset', 'Reset', '#b3263e', 140),
  ('other', 'Other', '#8e8e93', 150);

INSERT INTO spec_keys (key, label, group_name, unit, sort, hint) VALUES
  ('form_factor', 'Form factor', 'General', NULL, 100, 'Board family / footprint, e.g. "XIAO", "FireBeetle 2", "DevKitC (44-pin)"'),
  ('soc', 'SoC / module', 'Processor', NULL, 200, 'Exact chip or module part number, e.g. "ESP32-C5HR8", "ESP32-S3-WROOM-1-N16R8"'),
  ('cpu', 'CPU', 'Processor', NULL, 210, 'Architecture and cores, e.g. "32-bit RISC-V, single core"'),
  ('cpu_mhz', 'Clock', 'Processor', 'MHz', 220, 'Max HP core clock'),
  ('lp_cpu_mhz', 'Low-power core', 'Processor', 'MHz', 230, 'LP / ULP core clock, if any'),
  ('sram_kb', 'SRAM', 'Memory', 'KB', 300, 'On-chip SRAM'),
  ('rtc_sram_kb', 'LP / RTC SRAM', 'Memory', 'KB', 310, ''),
  ('rom_kb', 'ROM', 'Memory', 'KB', 320, ''),
  ('psram_mb', 'PSRAM', 'Memory', 'MB', 330, 'num = 0 when there is none'),
  ('flash_mb', 'Flash', 'Memory', 'MB', 340, ''),
  ('wifi', 'Wi-Fi', 'Wireless', NULL, 400, 'Standard, e.g. "Wi-Fi 6 (802.11ax)"'),
  ('wifi_5ghz', '5 GHz Wi-Fi', 'Wireless', NULL, 410, '"Yes" / "No"; num 1 / 0'),
  ('bluetooth', 'Bluetooth', 'Wireless', NULL, 420, 'e.g. "Bluetooth 5 (LE)", "Bluetooth 4.2 + BR/EDR"'),
  ('ieee802154', '802.15.4', 'Wireless', NULL, 430, 'Thread / Zigbee support, "No" if absent'),
  ('antenna', 'Antenna', 'Wireless', NULL, 440, 'PCB / ceramic / U.FL'),
  ('gpio', 'GPIO pins', 'I/O', 'pins', 500, 'GPIOs broken out to pins, as stated by the vendor'),
  ('adc', 'Analog inputs', 'I/O', 'pins', 510, 'ADC-capable pins broken out'),
  ('i2c', 'I2C', 'I/O', NULL, 520, ''),
  ('uart', 'UART', 'I/O', NULL, 530, ''),
  ('spi', 'SPI', 'I/O', NULL, 540, ''),
  ('usb', 'USB', 'I/O', NULL, 550, 'Connector and how it is wired, e.g. "USB-C, native USB Serial/JTAG"'),
  ('onboard', 'On board', 'I/O', NULL, 560, 'LEDs, buttons, connectors'),
  ('power_input', 'Power input', 'Power', NULL, 600, ''),
  ('battery', 'Battery', 'Power', NULL, 610, 'Battery connector and charger'),
  ('sleep_ua', 'Deep sleep', 'Power', 'µA', 620, 'Lowest board-level deep-sleep current'),
  ('temp_range', 'Operating temp.', 'Power', NULL, 630, ''),
  ('security', 'Security', 'Security', NULL, 700, '');

-- migrate:down
DROP TABLE markings;
DROP TABLE specs;
DROP TABLE spec_keys;
DROP TABLE pin_functions;
DROP TABLE function_categories;
DROP TABLE parts;
DROP TABLE devices;
