# pollicraft

A tiny single-file paper-alchemy game. Drag two ingredients together; the
combination is named by a small LLM, illustrated by an image model, and
uploaded to the media catalog. Every player builds on the same shared tree.

## How it uses the media catalog

The catalog has no first-class lineage — apps express relationships through
tag conventions on the existing primitive.

- Each newly crafted element is uploaded to `media.pollinations.ai` with:
  - `tag=parent:<leftHash>` and `tag=parent:<rightHash>` — the two ingredients
  - `tag=pollicraft` — generic opt-in for community listing
  - `tag=element:<slug>` — element identity
  - `tag=recipe:<a>+<b>` — deterministic recipe key (slugs sorted)
  - `tag=name:<slugified-name>` — display name
- Server stamps the verified `owner` (userId) and `app` (keyId) — these are
  server-attested, never client-claimed.
- Before crafting, the app checks `GET /tags/recipe:<a>+<b>?limit=1` for an
  existing discovery — that's the global recipe cache. Per-app tag namespacing
  (`tags/v1/by-app/<keyId>/recipe:...`) avoids collisions with other apps.
- "mine" tab reads `GET /me/media?limit=100`, filtered client-side to entries
  tagged `pollicraft`.
- "community" tab reads `GET /tags/pollicraft?limit=100`.

No backend. No PocketBase. The catalog is the database.

## Open

Start a local static server and open `index.html`. You'll need a pollinations
API key — click **connect** to run the OAuth flow.
