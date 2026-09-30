# CORS / Apps Script transport notes

This file records what is verified and what remains an assumption until deployed.

## Documented (Google Apps Script guides, see plan.md sources)
- `ContentService` responses are redirected (302) to `script.googleusercontent.com`; HTTP
  clients must follow redirects (`redirect: "follow"`, the `fetch` default).
- Apps Script web apps expose only `doGet`/`doPost` — there is no `doOptions`, so a CORS
  preflight (triggered by `Content-Type: application/json`, custom headers, or non-simple
  methods) cannot be answered and the browser blocks the request.
- A "simple request" POST (method GET/POST/HEAD, only simple headers, e.g.
  `Content-Type: text/plain`) does **not** trigger a preflight, so the browser sends it
  directly and only needs the *response* to be CORS-permitted, not the request itself.

## Assumption to verify on first real deployment (tracked in `cors-auth-poc`)
- That the final (post-redirect) response from `script.googleusercontent.com` is readable by
  `fetch()` from a `github.io` origin for a **simple** GET and a **simple** `text/plain` POST.
  Community reports say this works; we have not observed it ourselves yet.

## Resulting client rules (enforced by `apiClient.ts`)
- Always `Content-Type: text/plain;charset=utf-8` for POST, JSON-encoded string body.
- Never send an `Authorization` header or other custom header.
- Never rely on `mode: "no-cors"` (response becomes opaque/unreadable — useless here).
- Treat a network-level failure (`TypeError: Failed to fetch`) distinctly from an
  application-level `{ ok: false }` response, since the former likely indicates a CORS/redirect
  problem rather than a business error, and should surface as a "server unreachable — check
  deployment" state rather than a generic error toast.

## One-time manual step (cannot be automated by an agent)
Deploying the Apps Script project and creating a Google Cloud OAuth Client ID both require an
interactive Google account login in a browser. See `appsscript/README.md` for exact steps and
`webapp/scripts/smoke-test.md` for how to confirm the assumption above once deployed.
