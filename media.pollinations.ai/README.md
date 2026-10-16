# media.pollinations.ai 📦

> Media upload service for Pollinations

Upload files and get back a URL to use with Pollinations models.

## 🎯 What it does

- **Upload** media files via `POST /upload`
- **Retrieve** media by id via `GET /:id`
- **Publish** an upload by tagging it — anyone can browse a tag's public gallery via `GET /media?tag=`
- **Choose how long a file stays**: while it's used (default), a set time, or until you delete it; storage is paid in advance
- **Delete** files uploaded with your account's keys via `DELETE /media/:id`
- **CORS enabled** for browser uploads

## 🚀 Quick Start

### Upload a file

Uploads require a pollinations.ai API key. Get one at [enter.pollinations.ai](https://enter.pollinations.ai/keys).

```bash
# Multipart form-data
curl -X POST https://media.pollinations.ai/upload \
  -H "Authorization: Bearer <your-api-key>" \
  -F "file=@image.jpg"

# Stream a large file
curl -X POST https://media.pollinations.ai/upload \
  -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: video/mp4" \
  -H "X-File-Name: video.mp4" \
  --data-binary @video.mp4

# Base64 JSON
curl -X POST https://media.pollinations.ai/upload \
  -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "contentType": "image/png",
    "name": "image.png"
  }'

# Returns:
# {
#   "id": "3f9c1e2a-7b4d-4e2f-9a1c-8d6b5e4f3a2b",
#   "url": "https://media.pollinations.ai/3f9c1e2a-7b4d-4e2f-9a1c-8d6b5e4f3a2b",
#   "contentType": "image/jpeg",
#   "size": 123456
# }
```

### Choose how long a file stays

Storage is paid in advance at half of Cloudflare's price: 0.0075 pollen per
GB-month (files under 128 KB count as 128 KB), shown in your usage as model
`media`. The key that uploads a file pays each period up front, the first
right after the upload, so a key that can't pay gets `402`. `expiresAfter`
picks how the paid time runs, named after OpenAI's Files API:

| `expiresAfter` | The file |
|---|---|
| omitted | stays while it's used: a fetch in its last 15 paid days renews it for 30 days from then |
| `expiresAfter[anchor]=created_at` and `expiresAfter[seconds]=N` | is deleted N seconds (3600 to 2592000) after the upload |
| `never` | renews until you delete it; needs your secret (`sk_`) key |

```bash
curl -X POST https://media.pollinations.ai/upload \
  -H "Authorization: Bearer <your-secret-key>" \
  -F "file=@image.jpg" \
  -F "expiresAfter=never"

# Deleted one day after the upload:
curl -X POST https://media.pollinations.ai/upload \
  -H "Authorization: Bearer <your-key>" \
  -F "file=@image.jpg" \
  -F "expiresAfter[anchor]=created_at" \
  -F "expiresAfter[seconds]=86400"
```

If the key can't pay a renewal, is deleted, or its account is banned, the file
is deleted when its paid time ends. Keys without an account, and files
uploaded before paid storage, stay free and follow the old 30-day lifecycle.

### Publish to a tag gallery (alpha)

Tags are the publish action: add a `tags` field and the upload becomes publicly
listed in each tag's gallery. Untagged uploads stay unlisted — reachable only
by their unguessable id URL.

```bash
# Upload + publish
curl -X POST https://media.pollinations.ai/upload \
  -H "Authorization: Bearer <your-api-key>" \
  -F "file=@image.jpg" \
  -F "tags=sunset,landscape"

# Browse a tag's gallery — public, no API key
curl "https://media.pollinations.ai/media?tag=sunset"

# Unpublish + remove (owner's secret sk_ key)
curl -X DELETE https://media.pollinations.ai/media/<id> \
  -H "Authorization: Bearer <your-sk-key>"
```

### Retrieve a file

```bash
curl https://media.pollinations.ai/3f9c1e2a-7b4d-4e2f-9a1c-8d6b5e4f3a2b
# Returns: original file with correct content-type
```

### Check if file exists (HEAD request)

```bash
curl -I https://media.pollinations.ai/3f9c1e2a-7b4d-4e2f-9a1c-8d6b5e4f3a2b
# Returns: 200 with headers, or 404 if not found
```

## 📋 API Reference

### `POST /upload`

Upload a media file. **Requires API key** via `Authorization: Bearer <key>` header or `?key=<key>` query parameter.

**Request:**
- `Content-Type: multipart/form-data` with `file` field (optional `tags` field: comma-separated; optional `expiresAfter` field: `never`, or `expiresAfter[anchor]=created_at` with `expiresAfter[seconds]`)
- Or JSON with `Content-Type: application/json`:
  ```json
  {
    "data": "base64-encoded-file-data",
    "contentType": "image/jpeg",
    "name": "image.jpg",
    "tags": ["sunset", "landscape"],
    "expiresAfter": "never"
  }
  ```

Tagging **publishes** the upload to each tag's public gallery. `tags` accepts a
comma-separated string (or a JSON array in the JSON format), max 8 tags,
each `lowercase letters, digits, and _.:- (not leading), max 128 chars`.
Publishing requires a key attached to a user account.

`expiresAfter` sets how long the file stays (see Choose how long a file
stays): `"never"`, or `{ "anchor": "created_at", "seconds": N }` in JSON. It
needs a key attached to a user account, and `"never"` a secret (`sk_`) key.
Raw uploads use the default.

**Response:**
```json
{
  "id": "unique-media-id",
  "url": "https://media.pollinations.ai/{id}",
  "contentType": "image/jpeg",
  "size": 123456,
  "tags": ["sunset", "landscape"],
  "expiresAfter": "never"
}
```

`tags` is present only when the upload was tagged, `expiresAfter` only when
you sent one.

**Errors:**
- `400` - No file provided, empty file, invalid JSON/base64, invalid tags or `expiresAfter`, `expiresAfter` on a key without a user account, or `never` without a secret key
- `402` - The balance or the key's budget can't pay for storing the file
- `413` - File too large (max 400 MiB for multipart/raw uploads; 100 MiB for JSON)

### `GET /:id`

Retrieve a media file by its id.

**Response:**
- Binary file with correct `Content-Type`
- Untagged uploads: `Cache-Control: public, max-age=31536000, immutable`
- Published (tagged) uploads: `Cache-Control: no-store` so deletion takes effect immediately

**Headers:**
- `Content-Type` - MIME type
- `Cache-Control` - immutable for untagged uploads; `no-store` for published uploads
- `X-Content-Id` - Media id
- `X-Content-Size` - File size in bytes

**Errors:**
- `404` - File not found

### `HEAD /:id`

Check if a file exists without downloading.

**Response:**
- `200` with metadata headers if exists
- `404` if not found

### `GET /media?tag=<tag>` (alpha)

List the public gallery for a tag: every published item carrying that tag, any
owner, newest first. Fully public — no API key.

**Query params:** `tag` (required), `limit` (1–100, default 20), `cursor` (opaque, from a prior response's `nextCursor`).

**Response:** `{ items, nextCursor, hasMore }`. Pass `nextCursor` back as `?cursor=` while `hasMore` is true. Items never expose who uploaded them.

**Errors:**
- `400` - Missing/empty `tag`, or invalid `limit`/`cursor`

### `DELETE /media/:id` (alpha)

Delete a file uploaded with any of your account's keys, tagged or not: removes
the file, its paid storage, its catalog entry, and all its tags — it disappears from
galleries and its URL 404s. **Requires your secret (`sk_`) API key**;
publishable (`pk_`) keys are rejected since anyone can read them out of a
public client.

Untagged files are cached as immutable, so copies already in browser or other
caches can outlive the delete. Untagged files uploaded before owners were
recorded (October 2026) can't be deleted — they expire on their own (see
Retention Policy).

**Response:** `{ "deleted": true, "id": "<id>" }`

**Errors:**
- `401` - Missing or invalid API key
- `403` - Not a secret key, key has no user account, or you don't own the item
- `404` - Unknown id, or an older untagged file with no recorded owner

### `GET /`

Service info and health check.



## 💡 Use Cases

### Reference images for image-to-image generation

```bash
# Upload reference image
MEDIA_URL=$(curl -s -X POST https://media.pollinations.ai/upload \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@reference.jpg" | jq -r '.url')

# Use with Pollinations image API
curl "https://image.pollinations.ai/prompt/transform%20to%20cyberpunk?image=$MEDIA_URL"
```

### Audio samples for voice cloning

```bash
# Upload audio sample
curl -X POST https://media.pollinations.ai/upload \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@voice-sample.mp3"
```

## 🏗️ Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Deploy to production
npm run deploy:production
```

## 📊 Limits

- **Max file size:** 400 MiB for streamed multipart and raw uploads; 100 MiB for base64 JSON uploads. Existing FormData clients can use the larger limit without changing their request format. The `pollinations.ai` Cloudflare zone must allow at least 425 MB per request to accept 400 MiB uploads.
- **Storage:** Cloudflare R2
- **Retention:** paid in advance; by default a file stays while it's used (see Retention Policy)

## 🆔 Identifiers

Each upload gets a unique id. That single id is the storage key, the retrieval id (`GET /:id`), and — for published uploads — the catalog id you list and delete by. Re-uploading the same bytes yields a new id (no content deduplication).

- **Immutable bytes:** an id is never reused for other content. Untagged uploads use long-lived immutable caching; published uploads use `no-store` because owners can delete them.

## 📌 Retention Policy

- **Paid storage:** Files uploaded with your account's keys are paid in advance. By default a fetch in a file's last 15 paid days renews it for 30 days from then; a file nobody fetches is deleted when its paid time ends. `expiresAfter[anchor]=created_at` deletes it a set time after the upload, and `expiresAfter=never` renews it until you delete it. **This applies to published (tagged) items too** — an expired published item keeps its catalog entry in the gallery, but the URL 404s.
- **When a key can't pay:** If the key can't pay a renewal, is deleted, or its account is banned, the file is deleted when its paid time ends.
- **Free files:** Uploads with keys without an account, and files from before paid storage, follow R2's 30-day lifecycle: a GET refreshes an object once it is at least 15 days old.
- **Delete (alpha):** Owners can delete any file uploaded with their account's keys via `DELETE /media/:id` (secret key). Untagged files from before October 2026 can't be deleted — they expire on their own.
- **Publishing (alpha):** Tag uploads (via the `tags` field) to publish them, then list with `GET /media?tag=`. See the API Reference.
- **Abuse/copyright:** For takedown requests, contact the Pollinations team.

## 🔑 Authentication

Uploads require a pollinations.ai API key (`pk_` or `sk_`). Get one at [enter.pollinations.ai](https://enter.pollinations.ai/keys).

Pass the key via:
- `Authorization: Bearer <key>` header (recommended)
- `?key=<key>` query parameter

Retrieval (`GET /:id`, `HEAD /:id`) is **public** — no authentication required.

---

Built with 🌸 by [Pollinations.AI](https://pollinations.ai)
