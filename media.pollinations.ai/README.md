# media.pollinations.ai 📦

> Media upload service for Pollinations

Upload files and get back a URL to use with Pollinations models.

## 🎯 What it does

- **Upload** media files via `POST /upload`
- **Retrieve** media by id via `GET /:id`
- **Publish** an upload by tagging it — anyone can browse a tag's public gallery via `GET /media?tag=`
- **Delete** your published items via `DELETE /media/:id`
- **CORS enabled** for browser uploads

## 🚀 Quick Start

### Upload a file

Uploads require a pollinations.ai API key. Get one at [enter.pollinations.ai](https://enter.pollinations.ai).

```bash
# Multipart form-data
curl -X POST https://media.pollinations.ai/upload \
  -H "Authorization: Bearer <your-api-key>" \
  -F "file=@image.jpg"

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
- `Content-Type: multipart/form-data` with `file` field (optional `tags` field: comma-separated)
- Or JSON with `Content-Type: application/json`:
  ```json
  {
    "data": "base64-encoded-file-data",
    "contentType": "image/jpeg",
    "name": "image.jpg",
    "tags": ["sunset", "landscape"]
  }
  ```

Tagging **publishes** the upload to each tag's public gallery. `tags` accepts a
comma-separated string (or a JSON array in the JSON format), max 8 tags,
each `lowercase letters, digits, and _.:- (not leading), max 128 chars`.
Publishing requires a key attached to a user account.

**Response:**
```json
{
  "id": "unique-media-id",
  "url": "https://media.pollinations.ai/{id}",
  "contentType": "image/jpeg",
  "size": 123456,
  "tags": ["sunset", "landscape"]
}
```

`tags` is present only when the upload was tagged.

**Errors:**
- `400` - No file provided, empty file, invalid JSON/base64, or invalid tags
- `413` - File too large (max 50MB)

### `GET /:id`

Retrieve a media file by its id.

**Response:**
- Binary file with correct `Content-Type`
- `Cache-Control: public, max-age=31536000, immutable`

**Headers:**
- `Content-Type` - MIME type
- `Cache-Control` - `public, max-age=31536000, immutable`
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

Delete a published item you own: removes the file, its catalog entry, and all
its tags — it disappears from galleries and its URL 404s. **Requires your
secret (`sk_`) API key**; publishable (`pk_`) keys are rejected since anyone
can read them out of a public client.

Untagged uploads were never published and can't be deleted — they expire on
their own (see Retention Policy).

**Response:** `{ "deleted": true, "id": "<id>" }`

**Errors:**
- `401` - Missing or invalid API key
- `403` - Not a secret key, key has no user account, or you don't own the item
- `404` - Unknown id, or an untagged (never published) upload

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

- **Max file size:** 50MB
- **Storage:** Cloudflare R2
- **Default retention:** 30 days after upload (accessing a file resets its timer)

## 🆔 Identifiers

Each upload gets a unique id. That single id is the storage key, the retrieval id (`GET /:id`), and — for published uploads — the catalog id you list and delete by. Re-uploading the same bytes yields a new id (no content deduplication).

- **Immutable:** an id maps to one fixed set of bytes; it's never reused for other content, so URLs are safe to cache forever (`Cache-Control: public, max-age=31536000, immutable`).

## 📌 Retention Policy

- **30-day retention:** Files are retained for 30 days after upload; accessing a file resets its timer. **This applies to published (tagged) items too** — a published item nobody accesses for 30 days loses its file (the catalog entry keeps its place in the gallery, but the URL 404s).
- **Delete (alpha):** Owners can delete their published items via `DELETE /media/:id` (secret key). Untagged uploads can't be deleted — they expire on their own.
- **Publishing (alpha):** Tag uploads (via the `tags` field) to publish them, then list with `GET /media?tag=`. See the API Reference.
- **Abuse/copyright:** For takedown requests, contact the Pollinations team.

## 🔑 Authentication

Uploads require a pollinations.ai API key (`pk_` or `sk_`). Get one at [enter.pollinations.ai](https://enter.pollinations.ai).

Pass the key via:
- `Authorization: Bearer <key>` header (recommended)
- `?key=<key>` query parameter

Retrieval (`GET /:id`, `HEAD /:id`) is **public** — no authentication required.

---

Built with 🌸 by [Pollinations.AI](https://pollinations.ai)
