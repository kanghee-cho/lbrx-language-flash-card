# LBRX language flash card webapp

## Overview

This `webapp/` package is a Vite + React + TypeScript PWA for the local-first flash card client. The core path is:

- `src/core/*`: HLC, device ID, UUIDv7, keyboard shortcuts.
- `src/data/*`: Dexie schema, repositories, API client, local mutation signal.
- `src/domain/fsrsEngine.ts`: FSRS cache rebuild/scheduling.
- `src/sync/syncEngine.ts`: push/pull loop, debounced sync triggers, status store.
- `src/dev/mockAppsScript.ts`: in-memory mock of every backend action for dev/tests.
- `src/App.tsx`: router + app shell + current screens.

## Data flow

1. UI writes to Dexie repositories.
2. Mutable records get a fresh HLC and `dirty=true`; review logs get `pushed=false`.
3. `syncEngine` observes local mutations and later pushes dirty records.
4. `syncEngine` pulls by cursor, repositories apply remote rows only when remote HLC wins.
5. Review logs rebuild `cardStates`, which keeps study/due views fast.

`share.*` UI is a stub for later work. Anki `.apkg` import is the other planned extension point next to the CSV importer.

## Run

```bash
cd webapp
npm install
npm run dev
npm run test
npm run lint
npm run build
```

## Mock backend

- `npm run dev` uses the Vite middleware at `/__mock-appsscript__` when the settings screen leaves the server URL blank.
- Vitest uses the same `MockAppsScriptService` directly for end-to-end sync tests.
- Production builds do **not** depend on the mock. Set the real Apps Script deployment URL in Settings once available.

## Real backend settings

The Settings screen persists:

- Google OAuth Client ID
- Apps Script base URL

Both default to blank. The app still works locally when signed out; sign-in is only needed for sync.

## Transport rules — do not break these

- Always `POST` with `Content-Type: text/plain;charset=utf-8`.
- Always send a JSON string body with the API envelope.
- Never send `Authorization` or any custom headers.
- Keep `fetch(..., { redirect: 'follow' })` behavior.
- Distinguish network/CORS/deployment failures from `{ ok: false }` application errors.

Those constraints come directly from `docs/cors-notes.md` and `docs/api-contract.md`.
