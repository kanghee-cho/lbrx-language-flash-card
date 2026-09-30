# API contract: PWA ⇄ Apps Script

The Apps Script web app exposes a single POST endpoint that is routed internally by an
`action` field. This avoids CORS preflights (see `docs/cors-notes.md`): every request uses
`Content-Type: text/plain;charset=utf-8` with a JSON-encoded string body — never
`application/json` and never custom headers (the Google ID token travels **inside** the
JSON body, not in an `Authorization` header).

`doGet` is used only for an unauthenticated health check.

## Transport rules (do not violate — these are what keep requests "simple" and preflight-free)

- Method: `GET` (health only) or `POST` (everything else).
- `POST` body `Content-Type`: `text/plain;charset=utf-8`.
- No custom request headers.
- Client must use `redirect: "follow"` (the default) because Apps Script responses are
  302-redirected to `script.googleusercontent.com`.
- Response `Content-Type` is always `application/json` (via `ContentService`).

## Envelope

Request:
```jsonc
{
  "action": "sync.pull",       // see Actions below
  "idToken": "<Google ID token, or null for auth.ping>",
  "deviceId": "device-generated-uuid",
  "payload": { }               // action-specific, see below
}
```

Response (success):
```jsonc
{ "ok": true, "data": { } }
```

Response (error):
```jsonc
{ "ok": false, "error": { "code": "unauthorized", "message": "..." } }
```

Error codes: `unauthorized` (bad/expired/missing idToken), `forbidden` (record not owned by
caller), `validation` (bad payload), `not_found`, `rate_limited` (Apps Script quota reached —
client should back off), `internal`.

## Actions

### `auth.ping`
Verifies the ID token and returns the caller's stable user id (the verified `sub` claim,
never a client-supplied value) and whether this is a first-time user (Users sheet row created
if missing). `payload: {}` → `data: { userId, email, isNew }`.

### `sync.pull`
`payload: { cursor: number, limit?: number }` (default limit 500, max 2000).
`data: { decks: DeckRecord[], cards: CardRecord[], reviewLogs: ReviewLogRecord[], media: MediaRecord[], nextCursor: number, hasMore: boolean }`.
Returns every row (including soft-deleted) owned by the caller with `server_seq > cursor`,
across all four sheets, capped at `limit` per sheet, sorted by `server_seq` ascending.

### `sync.push`
`payload: { changes: { decks: DeckRecord[], cards: CardRecord[], reviewLogs: ReviewLogRecord[], media: MediaRecord[] } }`.
`data: { accepted: number, ignored: number, rejected: { entity, id, reason }[] }`.
Semantics: last-write-wins by `hlc` string compare (lexicographic) per record, ownership
enforced server-side, review logs are insert-only/idempotent by id. Same rules as the earlier
Rust design (see `docs/hlc.md`).

### `media.requestUpload`
`payload: { id: string, sha256: string, mime: string, size: number }`.
Creates (or returns existing) a placeholder Media row and a Drive upload target.
`data: { uploadUrl?: string, driveFileId?: string, alreadyUploaded: boolean }`.
Because Apps Script web apps cannot easily accept large binary bodies without preflight-safe
multipart handling, the client uploads bytes as a base64 string in a follow-up `media.upload`
action (chunked if needed) rather than a separate binary endpoint.

### `media.upload`
`payload: { id: string, base64Chunk: string, chunkIndex: number, totalChunks: number, sha256: string }`.
Server appends the chunk to a Drive file (or Apps Script cache) and, on the final chunk,
verifies the SHA-256 and marks the Media row `uploaded = true`.
`data: { complete: boolean }`.

### `media.download`
`payload: { id: string }` → `data: { base64: string, mime: string }` (owner only).
Small images only (see quota notes) — this is not meant for large files.

### `share.create` / `share.get` / `share.revoke` / `share.import`
Same semantics as the original Rust design: deck sharing creates a copy in the recipient's
account. `payload` shapes mirror the Rust OpenAPI spec's `/v1/shares*` bodies with camelCase
keys. (Implemented after the core sync loop; see plan.)

## Record shapes (camelCase; `hlc`, timestamps as ISO strings)

```ts
interface DeckRecord {
  id: string; name: string; description?: string | null;
  sourceLang: string; targetLang: string; tags: string[];
  hlc: string; createdAt: string; deletedAt?: string | null;
}
interface CardRecord {
  id: string; deckId: string; front: string; back: string;
  reading?: string | null; example?: string | null; memo?: string | null;
  tags: string[]; imageMediaId?: string | null;
  hlc: string; createdAt: string; deletedAt?: string | null;
}
interface ReviewLogRecord {
  id: string; cardId: string; rating: 1 | 2 | 3 | 4;
  reviewTime: string; testType: "flip" | "typing" | "choice";
  durationMs: number; deviceId: string;
}
interface MediaRecord {
  id: string; sha256: string; mime: string; size: number; uploaded: boolean;
  hlc: string; createdAt: string; deletedAt?: string | null;
}
```

## Sheets layout (spreadsheet acts as the database)

One spreadsheet per deployment (the script owner's). Tabs: `Users`, `Decks`, `Cards`,
`ReviewLogs`, `Media`, `Shares`, `Meta` (single row holding the next server-seq counter).
Every data tab's first column is `userId` (verified token `sub`) and a `serverSeq` column is
appended on every insert/update, assigned from `Meta` inside a `LockService` critical section.
See `appsscript/README.md` for the exact column order.
