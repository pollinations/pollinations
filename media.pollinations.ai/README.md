# media.pollinations.ai 📦

> Media upload service for Pollinations

Upload files and get back a URL to use with Pollinations models.

## 🎯 What it does

- **Upload** media files via `POST /upload`
- **Retrieve** media by id via `GET /:id`
- **CORS enabled** for browser uploads

## 🚀 Quick Start

### Upload a file

Uploads require a pollinations.ai API key. Get one at [enter.pollinations.ai](https://enter.pollinations.ai).

```bash
# Multipart form-data
curl -X POST https://media.pollinations.ai/upload \
  -H "Authorization: Bearer <your-api-key>" \
  -F "file=@image.jpg"

# Raw binary
curl -X POST https://media.pollinations.ai/upload \
  -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: image/jpeg" \
  --data-binary "@image.jpg"

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
- `Content-Type: multipart/form-data` with `file` field
- Or raw binary with a `Content-Type` header (e.g., `image/jpeg`)
- Or JSON with `Content-Type: application/json`:
  ```json
  {
    "data": "base64-encoded-file-data",
    "contentType": "image/jpeg",
    "name": "image.jpg"
  }
  ```

**Response:**
```json
{
  "id": "unique-media-id",
  "url": "https://media.pollinations.ai/{id}",
  "contentType": "image/jpeg",
  "size": 123456
}
```

**Errors:**
- `400` - No file provided, empty file, or invalid JSON/base64
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

### `GET /media` (alpha)

List cataloged media, newest first. The `tag` query param picks the mode:

- **No `tag`** — your own library (all items you own, including untagged). Requires a user-owned **secret** (`sk_`) API key; publishable keys are rejected since anyone can read them out of a public client. A key minted through a BYOP app lists only items created through that app.
- **`?tag=<tag>`** — public gallery for that tag (any owner). Auth optional; pass a key to get `myReactions`.

**Query params:** `tag` (optional), `limit` (1–100, default 20), `cursor` (opaque, from a prior response's `nextCursor`).

**Response:** `{ items, nextCursor, hasMore }`. Pass `nextCursor` back as `?cursor=` while `hasMore` is true.

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

Each upload gets a unique id. That single id is the storage key, the retrieval id (`GET /:id`), and — for cataloged uploads — the id you react to. Re-uploading the same bytes yields a new id (no content deduplication).

- **Immutable:** an id maps to one fixed set of bytes; it's never reused for other content, so URLs are safe to cache forever (`Cache-Control: public, max-age=31536000, immutable`).

## 📌 Retention Policy

- **30-day retention:** Files are retained for 30 days after upload; accessing a file resets its timer.
- **No delete endpoint:** Files cannot be deleted via the API.
- **Listing (alpha):** Tag uploads (via the `tags` field) to catalog them, then list with `GET /media`. See the API Reference.
- **Abuse/copyright:** For takedown requests, contact the Pollinations team.

## 🔑 Authentication

Uploads require a pollinations.ai API key (`pk_` or `sk_`). Get one at [enter.pollinations.ai](https://enter.pollinations.ai).

Pass the key via:
- `Authorization: Bearer <key>` header (recommended)
- `?key=<key>` query parameter

Retrieval (`GET /:id`, `HEAD /:id`) is **public** — no authentication required.

---

Built with 🌸 by [Pollinations.AI](https://pollinations.ai)
