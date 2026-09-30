# LBRX Language Flash Cards

A language-learning flash card PWA (English, Spanish, Japanese, ...) with FSRS-based
spaced repetition. It runs installed on Android, iOS, macOS, and Windows from a single
static site, works fully offline, and syncs private per-account data across devices
through a Google Apps Script backend on top of Google Sheets/Drive.

Live app: https://kanghee-cho.github.io/lbrx-language-flash-card/

## Why this architecture

- **No servers to run or pay for.** The frontend is a static site on GitHub Pages; the
  backend is a Google Apps Script web app the account owner deploys for free.
- **Local-first.** All data lives in IndexedDB on the device first; the UI never blocks
  on the network. A background sync engine pushes/pulls changes when online.
- **Private per Google account.** Each user signs in with their own Google account; the
  backend verifies the ID token and scopes every row to the verified user.
- **Full offline support.** Add cards, edit decks, and run study sessions with no
  connection; everything queues locally and syncs later.

See `docs/api-contract.md`, `docs/hlc.md`, and `docs/cors-notes.md` for the technical
contract and the architectural risk (browser CORS behavior against Apps Script) that
shaped these decisions.

## Repository layout

```
webapp/      Vite + React + TypeScript PWA (the app users install/visit)
appsscript/  Google Apps Script backend (JSON API over Google Sheets + Drive)
docs/        API contract, HLC spec, CORS notes, one-time Apps Script deployment guide
.github/     CI: build/test/deploy webapp to GitHub Pages on every push to main
```

## Getting started (development)

```bash
cd webapp
npm install
npm run dev      # local dev server with an in-memory mock backend
npm run test      # vitest
npm run lint      # eslint --max-warnings=0
npm run build     # tsc -b && vite build
```

```bash
cd appsscript
npm install
npm run build     # concatenates src/ into dist/Code.gs
node --test       # pure-logic unit tests (no Google account needed)
```

## Deploying your own backend (required once, manual)

The frontend is deployed automatically by GitHub Actions on every push to `main`. The
Apps Script backend, however, requires a one-time manual setup under **your own Google
account** — Apps Script projects, Google Sheets, Drive folders, and OAuth Client IDs
cannot be created non-interactively.

Follow **`docs/appsscript-setup.md`** step by step: create the Apps Script project and
backing Spreadsheet, create an OAuth Client ID, set the `SPREADSHEET_ID` /
`GOOGLE_CLIENT_IDS` script properties, deploy as a web app ("Execute as: Me", "Who has
access: Anyone"), and paste the resulting web app URL plus OAuth Client ID into the
app's Settings screen.

After deploying, run the curl smoke test in that doc and confirm sign-in + sync work
from the live GitHub Pages site before relying on it for real data — the single biggest
open risk in this architecture is whether a browser can read the Apps Script response
through its `script.googleusercontent.com` redirect from a `github.io` origin. If that
assumption ever breaks, `docs/cors-notes.md` documents the fallback options.

## Feature scope

- Decks with source/target language, tags, and per-card front/back, reading, example,
  memo, and an optional image attachment (stored in Drive).
- Fast keyboard-first card entry (desktop) and touch-first study sessions (mobile).
- Flip, typing, and multiple-choice study modes with FSRS scheduling and full review
  history.
- Text-to-speech using the device's available voices.
- CSV import (Anki `.apkg` import is not yet implemented).
- Deck sharing by code (copy-on-import; no live collaborative editing).
- Local, best-effort due-card reminders (Notification API; no background push).
- JSON export/restore of all local data as a manual backup.

## Limits and constraints worth knowing

- Google Sheets is not a real database: no relational constraints, slow full-sheet
  scans, and Apps Script execution/quota ceilings. This is scoped for a personal or
  small-group user base, not high scale.
- Apps Script web apps have no CORS preflight handler, so every request must avoid
  triggering one (`text/plain` body, no custom headers) — see `docs/cors-notes.md`.
- IndexedDB is not a backup; use Settings → Backup & restore to export a JSON snapshot
  periodically.
- Background sync, notifications, and installed-PWA behavior vary by OS/browser,
  especially on iOS; features that depend on them are explicitly best-effort.
