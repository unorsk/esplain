# esplain: agent guide

esplain explains physical devices (mostly ESP32 dev boards): a 3D model where every pin and component is clickable, a spec card, and a spec comparison. All content lives in one SQLite database, `db/esplain.db`, which is committed. The app reads it through Kysely. Adding a device means inserting rows. You normally do not need to touch code.

## Commands

```sh
npm ci                     # install (exact pins, install scripts disabled via .npmrc)
npm run dev                # http://localhost:5173, live-reloads on src/ or DB changes
npm run sql -- "SELECT …"  # query, printed as a table (--json for JSON)
npm run sql -- -f x.sql    # run a script in ONE transaction; any error rolls everything back
npm run check [slug]       # validate device data; errors fail the Pages deploy
npm run shot -- <slug> [--part KEY] [--views angle,top,bottom]
                           # render shots/<slug>-<view>.png + -page.png; LOOK at them
npm run typecheck
npm run build              # static site in dist/ (what GitHub Pages serves)
npm run db:migrate         # apply new dbmate migrations (updates db/schema.sql)
```

`shot` needs Chrome. It uses installed Google Chrome, or set `CHROME_PATH` (in Claude cloud sessions: `CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; check with `ls /opt/pw-browsers`).

Always go through `npm run sql`, not a different SQLite client. It enforces foreign keys, runs scripts atomically, and works around `node:sqlite`, which silently ignores every statement after the first in a prepared string.

## Data model

The full schema is in `db/schema.sql`. Natural keys are used everywhere (the device `slug`, the part `key`), so inserts never need ids.

| table | one row per | notes |
|---|---|---|
| `devices` | device | `slug` PK; body (PCB) geometry: `width_mm` (x), `length_mm` (y), `thickness_mm`, `corner_radius_mm`, `color` (soldermask), `silk_color` |
| `parts` | clickable thing | PK `(device, key)`; `kind` = `pin` or `component`; `shape` = renderer primitive; geometry; `props` JSON |
| `pin_functions` | signal name on a pin | PK `(device, part, name)`; `category` → `function_categories.key`; shown as coloured tags, in insertion order |
| `specs` | spec value | PK `(device, key)`; `key` → `spec_keys.key`; `value` = display text, `num` = number in `spec_keys.unit` |
| `markings` | silkscreen text | drawn on the body surface (`side`, `x`, `y`, `size` = cap height in mm, `rotation`, `align` = `start`/`center`/`end` in reading direction) |
| `spec_keys` | comparable spec | shared by all devices; `hint` says what to put in it |
| `function_categories` | tag colour group | power, gnd, gpio, digital, analog, i2c, uart, spi, sdio, usb, jtag, lp (LP/RTC GPIO), touch, dac, boot, reset, other |

Deleting a device cascades to all of its rows, so a device script can start with `DELETE FROM devices WHERE slug = '…'` and be re-run as often as needed.

### Coordinates (important)

- Units are millimetres. The origin is the centre of the body. +x points right and +y points to the "top" edge when the board is seen from above in its usual orientation (USB at the top for most boards).
- **Bottom-side parts use the same top-view frame.** A pad you see on the left in a picture of the back has a positive `x`. When measuring from a back-side image, use `x_top = -x_back`.
- `x, y` is the centre of the part. `w` is its size along x, `l` along y, `h` its height above the surface (below it for `side = 'bottom'`).
- `rotation`: degrees counter-clockwise in the top view. `w` and `l` are the part's own, unrotated size. For example, a connector whose opening faces +x has `rotation = -90`, and its `w` runs along y on the board.
- Markings on the bottom are drawn as seen when looking at the bottom (the board flipped left-right), so their `rotation` and `align` read naturally from that side, while `x` stays in the top-view frame.

### Shapes

| shape | use | geometry | props |
|---|---|---|---|
| `castellated` | half-hole edge pin | pad rectangle; it is forced flush with the nearest edge, and the half hole sits on that edge at the pad's centre line | `drill` (mm, default 1.0) |
| `hole` | through-hole pin or mounting hole | `w` = annular ring diameter; the board gets a matching cut-out | `drill` (mm, default 1.0), `plated: false` for a bare mounting hole, `edge: true` when the hole is also joined by a pad to a castellated half hole on the nearest edge (FireBeetle 2 style) |
| `pad` | SMD / test pad | `w × l` | `round: true` gives a circle or stadium; `radius` sets the corner radius |
| `usb_c` | USB-C receptacle | `w × l × h`, opening faces +y at rotation 0 | |
| `button` | top-pressed SMD tact switch | `w × l × h` | `cap_ratio` (0.6), `cap_color`, `body_color` |
| `side_button` | side-pressed tact switch | `w × l × h`, actuator points +y at rotation 0 | `reach` (mm the actuator sticks out, 0.8), `cap_color`, `body_color` |
| `led` | 0402/0603/0805 LED | `w × l × h` | `color`, `lit: false` when the lit colour is unknown (renders an unlit lens) |
| `shield` | RF can soldered to the board | `w × l × h` | `label` (first line is drawn as a heading; lines separated by `\n`), `label_bg` (omit for bare metal), `label_fg`, `label_inset` |
| `module` | radio module (ESP32-WROOM style): castellated module PCB, metal can, PCB antenna | `w × l × h` (total height), antenna end faces +y at rotation 0 | `antenna_l` (6), `pcb_h` (0.8), `pcb_color`, `side_pads` (14), `end_pads` (10), `can_w`, `can_l`, `antenna_turns`, plus the `shield` label props |
| `ufl` | U.FL / IPEX connector | `w × l × h` | |
| `jst` | wire-to-board connector (JST PH style) | `w` along the pin row × `l` depth × `h`, opening faces +y at rotation 0 | `pins` (2), `pitch` (2.0), `lead` (mm of lead behind the housing), `color` |
| `fpc` | FPC/FFC ZIF connector | `w × l × h`, contacts on the +y side at rotation 0 | `pins` (18), `pitch` (0.5), `color`, `slot_color` |
| `chip` | IC package | `w × l × h` (body) | `text`, `text_color`, `color`; `pins` per side with `pitch` (1.27) draws gull-wing leads on the ±y sides (`pins_axis: "x"` for ±x) |
| `antenna` | PCB meander antenna (copper under the soldermask) | `w × l`, `h` ≈ 0.035 | `turns` (5), `trace` (mm, 0.5) |
| `box` | anything else (crystals, diodes, inductors) | `w × l × h` | `color`, `metalness`, `roughness` |

Unknown shapes render as `box`, and `npm run check` flags them. To add a shape, add its name to `src/shapes.ts`, add a builder in `src/viewer/model.ts` (local frame: origin at the part centre on the surface, +y up and away from the board; "faces +y on the board" means facing local -z), and document it in this table. Soldered male headers do not exist yet. Add them when the first board that ships with headers soldered arrives.

## Adding a device

1. **Gather sources.** Ask the user for the vendor pinout image, the product page specs and photos rather than doing lengthy web searches. Ask for the **dimension drawing and the schematic up front**; vendor download hosts are often unreachable from a cloud session, but the user can attach them.
   - The dimension drawing is the authority for geometry. Rendered pinouts can be off: the FireBeetle 2 hole rows measured 23.6 mm apart on the render, while the drawing says 22.86 mm (0.9").
   - The schematic is the authority for what parts are, LED colours, pull-ups and series resistors, power paths and protection. It turns "unidentified" parts into explained ones.
   - Rasterise a PDF with `pdftoppm -r 600 -png file.pdf out`, then crop the regions you need. For long manuals, render a contact sheet of thumbnails first (`pdftoppm -r 30`) to find the pinout, dimension and schematic pages.
   - Vendor manuals are often assembled from other boards' pages. The FireBeetle 2 ESP32-E manual's GDI pin table is the Beetle ESP32-C3's, and its USB circuit shows a CH9102F while the V1.0 schematic and board use a CH340K. Cross-check every table against the schematic for the revision printed on the board (and the example code and Arduino variant), and say in the description where a mapping came from.
   - Read the whole schematic, not only the pin tables. Most of the useful caveats live in the power and support circuits:
     - what an `EN` pin really drives (the ESP32-E's is the regulator enable)
     - ADC pins tied to a battery divider
     - button pull-ups that don't exist
     - missing reverse-polarity protection
     - which test pads connect where
   - For pin facts, also use the board's Arduino variant `pins_arduino.h` (`raw.githubusercontent.com/espressif/arduino-esp32/master/variants/<BOARD>/pins_arduino.h`) and the ESP-IDF docs (`raw.githubusercontent.com/espressif/esp-idf/master/docs/en/api-reference/peripherals/gpio/<chip>.inc`).
2. **Check existing vocabulary** so the device compares cleanly with the others:
   ```sh
   npm run sql -- "SELECT key, label, unit, hint FROM spec_keys ORDER BY sort"
   npm run sql -- "SELECT key, label FROM function_categories ORDER BY sort"
   npm run sql -- "SELECT * FROM parts WHERE device = 'seeed-xiao-esp32c5'"   # a worked example
   ```
3. **Measure the geometry from the image.** Find the board edges in pixels, compute px/mm from the known board size, then convert each centre: `x = (px - cx) / s`, `y = (cy - py) / s`, where `(cx, cy)` is the pixel centre of the board and `s` is px/mm. Snap to the real grid: header pins sit at a 2.54 mm pitch, symmetric about the centre, so use ±1.27, ±3.81 or 0, ±2.54, … rather than raw measurements. For a back-side image, negate x.
   - Vendor pinout renders are the cleanest source; product photos are useful to confirm what the renders leave out (antennas, crystals, which parts are metal). Rendered diagrams and photos are often rotated 180° from each other. Pick one orientation (USB at +y) and convert everything to it.
   - The pin pitch is a better scale reference than the board outline: the distance between the first and last hole of a row is exactly `(n - 1) × 2.54` mm.
   - Finding pad and hole centres by colour is faster and more accurate than eyeballing. If Python with Pillow is available, threshold the gold pixels (roughly `r > 170, g > 120, b < 110`), flood-fill the blobs and take their centroids.
4. **Write one SQL script** in a scratch location (not in the repo). Use this order: `DELETE` the device, then `devices`, pin `parts`, `pin_functions`, component `parts`, `markings`, `specs`. Apply it with `npm run sql -- -f script.sql`. Fix and re-run it until it is clean.
5. **Validate:** `npm run check <slug>` must report 0 errors. Resolve the warnings, or justify leaving them.
6. **Look at it:** `npm run shot -- <slug>` and open the top, bottom and angle PNGs next to the reference image. Check that pins line up with their labels, the bottom side is mirrored correctly, components do not overlap, and the silkscreen is legible. Iterate.
7. **Commit** `db/esplain.db`, plus any new assets or code. Do not commit `shots/`.

### Conventions

- `slug`: `vendor-model`, lowercase, hyphenated (`seeed-xiao-esp32c5`, `dfrobot-firebeetle2-esp32c6`).
- Boards built on a radio module (WROOM, WROVER, MINI) use one `module` part for it. Put the module name in `specs.soc` together with the chip inside, e.g. `ESP32-WROOM-32E (ESP32-D0WD-V3)`.
- Part `key`: unique within the device and stable, because URLs use it (`#/d/<slug>/<key>`). For pins, use the silkscreen label (`D0`, `5V`); when that label is long (`5/A4/LP_TX`), use `IO<gpio>` (`IO5`). When a label repeats, add a suffix: `GND.back`, `3V3.2`, `NC.1`. For components, use snake_case (`usb`, `btn_boot`, `led_user`).
- `label`: exactly what is printed on the board, or the vendor's name for it. When the front and back print differ, use the more descriptive one (FireBeetle prints `23` on the front and `23/SCK` on the back).
- Not-connected pins are still pins: give them the `NC` function (category `other`) and say so in the description.
- Pins shared with an on-board connector (the FireBeetle GDI display port, for example) must say so in their description, with the connector's signal name.
- Visible parts nobody documents may still be added when they matter for the look. Put them in `group_name = 'Unidentified'` and say plainly in the description that they are unidentified.
- When the schematic names a part but the drawing doesn't say which footprint it is (two identical diodes, three SOT-23 MOSFETs), describe the set in each and say that the drawing doesn't say which is which. Don't guess.
- `group_name`: physical grouping such as `Left edge`, `Right edge`, `Back pads` or `J1 header`. Set `sort` so the list follows the physical order (top to bottom within each group).
- `pin_functions` order: board name first (`D0`), then GPIO (`GPIO1`), then peripheral roles (`A0`, `SDA`, `TX`, `MOSI`), then LP and other names. Add `STRAP` (category `boot`) to every strapping pin. Power pins get `power`, ground pins `gnd`.
- `specs.value` is what a person reads ("8 MB", "Yes (2.4 + 5 GHz)"). `num` must be set whenever `spec_keys.unit` is set, and it must be in that unit. Booleans are stored as "Yes …"/"No" with `num` 1/0.
- Need a spec that does not exist yet? Add it to `spec_keys`: snake_case key, a `group_name` matching an existing group, a `sort` inside that group's hundred, and a `hint`. Do this in the same script as the device.

### Writing descriptions

These descriptions are the point of the tool, so make them specific and true:

- Say what the pin or part is wired to and what it is for in practice: the default role in the Arduino core and ESP-IDF, the GPIO number, and the ADC channel.
- Include the caveats that bite people:
  - strapping pins
  - boot-log output on UART0 TX
  - the USB D−/D+ pins
  - flash/PSRAM pins that must not be used
  - input-only pins (classic ESP32 GPIO34–39)
  - ADC2 being unusable while Wi-Fi is on (classic ESP32, S2, S3)
  - 5 V tolerance
  - current limits, but only when the vendor states them
- No marketing copy. No speculation presented as fact: if a source is missing, leave the detail out or say it is unverified.
- Plain text. A blank line separates paragraphs; wrap code-ish names in backticks for monospace.

## Changing the schema

1. `npm run db:new -- <name>` creates `db/migrations/<timestamp>_<name>.sql`. Write both the `-- migrate:up` and the `-- migrate:down` part.
2. `npm run db:migrate` applies it and rewrites `db/schema.sql`. dbmate needs the `sqlite3` CLI for that dump.
3. Update `src/server/db-types.ts` (Kysely types), `src/types.ts` (catalog JSON) and `src/server/catalog.ts` if the data should reach the UI.
4. `npm run typecheck && npm run check && npm run build`.

## Code map

- `src/server/` Kysely on `node:sqlite` (`db.ts`), table types, and `catalog.ts`, which turns the DB into `data/catalog.json`.
- `src/viewer/` three.js. `model.ts` builds meshes from parts; `viewer.ts` handles the camera, picking and labels; `textures.ts` draws the silkscreen and labels.
- `src/main.ts` holds the pages (device list, device, compare) with hash routing. `src/style.css` holds all the styles.
- `scripts/` contains the dev server, build, sql, check and shot.

## Dependencies

Runtime: `three`, `kysely`. Dev: `esbuild`, `typescript`, `dbmate`, `playwright-core` and type packages. That is deliberate. Before adding a package, prefer a few lines of code or a Node built-in. If one is unavoidable, pin it exactly (`.npmrc` has `save-exact`) and check its transitive dependencies with `npm ls --all`. Install scripts are disabled (`ignore-scripts=true`), so never add a package that needs one.
