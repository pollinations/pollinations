# pollicraft

A tiny single-file paper-alchemy game. Drag two ingredients together; the
combination is named by a small LLM, illustrated by an image model, and
uploaded to the media catalog. Every player builds on the same shared tree.

## How it uses the media catalog

- Each newly crafted element is uploaded to `media.pollinations.ai` via the
  authenticated upload endpoint. The upload carries:
  - `parent=<alphabetically-first ingredient hash>` — the lineage edge
  - `tag=element:<slug>` — element identity
  - `tag=recipe:<a>+<b>` — deterministic recipe key (sorted)
  - `tag=name:<slugified-name>` — display name
- Server stamps `app:pollicraft` and `owner:<userId>` (these are server-attested,
  not client-claimed).
- Before crafting, the app checks `GET /apps/pollicraft/media` for an existing
  element with the same `recipe:<a>+<b>` tag — that's the global recipe cache.
- "mine" tab reads `GET /me/media?app=pollicraft`.
- "community" tab reads `GET /apps/pollicraft/media`.

No backend. No PocketBase. The catalog is the database.

## Open

Start a local static server and open `index.html`. You'll need a pollinations
API key — click **connect** to run the OAuth flow.
