# Hybrid Logical Clock (HLC)

Used to order edits across offline devices for last-write-wins conflict resolution on
`decks`, `cards`, and `media` records (never on `reviewLogs`, which are insert-only).

Format (ASCII, lexicographically comparable):

```
<unix-millis, 15 digits, zero-padded>-<counter, 5 digits, zero-padded>-<node id>
e.g. 000001727650000000-00000-3f2a9c1e
```

- `node id`: the device's persisted UUID, first 8 hex characters (lowercase).
- `send()`: called for every local mutation. `physical = max(now, lastPhysical)`; if
  `physical == lastPhysical` increment counter, else reset counter to 0. Store and return the
  new HLC string.
- `receive(remoteHlc)`: called when applying a pulled record. `physical = max(now, lastPhysical,
  remotePhysical)`; counter resets/increments analogously, guaranteeing the local clock never
  produces a value that could compare less-than-or-equal to any value it has seen.
- Comparison is a plain string compare (`a < b`), because all three components are fixed-width.

Server (Apps Script) never invents HLCs for client-owned entities — it only compares. For
server-side deep-copies (share import) it mints a new HLC using the same format with
`node id = "server"`.
