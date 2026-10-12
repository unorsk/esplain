# esplain

Interactive explainer for dev boards and other physical devices. Pick a device to get a 3D model with every pin and component clickable, a spec card, and a side-by-side spec comparison.

## Run locally

Requires Node 22.18+ (it uses the built-in `node:sqlite` and native TypeScript support).

```sh
npm ci
npm run dev        # http://localhost:5173
```

The dev server reads `db/esplain.db` on every request and reloads the page when the database or `src/` changes.

## Adding devices

Devices are rows in `db/esplain.db` (SQLite, schema managed by dbmate). The workflow, schema, coordinate conventions and the tooling (`npm run sql`, `npm run check`, `npm run shot`) are in [AGENTS.md](AGENTS.md). In short: run Claude in this repo, give it the pinout image and specs, and ask it to add the device.

To see readable database diffs locally, map the `sqlite3` diff driver once:

```sh
git config diff.sqlite3.textconv "sh -c 'sqlite3 \"\$0\" .dump'"
```

## Deploy

`.github/workflows/pages.yml` type-checks, validates the data, builds a static site and deploys it to GitHub Pages on every push to `main`. In the repository settings, set Pages → Source to "GitHub Actions". The deployed site is read-only: it serves a JSON export of the database.

## Dependencies

The dependency tree is kept small on purpose (see AGENTS.md). Versions are pinned exactly, `package-lock.json` is committed, and npm install scripts are disabled in `.npmrc`.
