# media.pollinations.ai 📦

> Content-addressed media upload service for Pollinations

Upload files and get back a content-addressed URL to use with Pollinations models.

## 🎯 What it does

- **Upload** media files via `POST /upload`
- **Retrieve** media by hash via `GET /:hash`
- **Deduplicate** - identical files return the same URL (SHA-256 content hashing)
- **Configurable retention** - choose how long your file is stored (0.01–730 days)
- **CORS enabled** for browser uploads

## 🚀 Quick Start

### Upload a file

Uploads require a pollinations.ai API key. Get one at [enter.pollinations.ai](https://enter.pollinations.ai).

```bash
# Multipart form-data (default 30-day retention)
curl -X POST https://media.pollinations.ai/upload \
  -H "Authorization: Bearer <your-api-key>" \
  -F "file=@image.jpg"

# With custom retention (7 days)
curl -X POST "https://media.pollinations.ai/upload?expires=7" \
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
#   "id": "a3f2b1c4d5e6f7...",
#   "url": "https://media.pollinations.ai/a3f2b1c4d5e6f7...",
#   "contentType": "image/jpeg",
#   "size": 123456,
#   "duplicate": false,
#   "expiresAt": "2026-06-10T04:00:00.000Z",
#   "retentionDays": 30
# }
```

### Retrieve a file

```bash
curl https://media.pollinations.ai/a3f2b1c4d5e6f7...
# Returns: original file with correct content-type
# Returns 410 if file has expired
```

### Check if file exists (HEAD request)

```bash
curl -I https://media.pollinations.ai/a3f2b1c4d5e6f7...
# Returns: 200 with headers, or 404 if not found, or 410 if expired
```

## 📋 API Reference

### `POST /upload`

Upload a media file. **Requires API key** via `Authorization: Bearer <key>` header or `?key=<key>` query parameter.

**Query parameters:**
- `expires` (float, optional) — Retention period in days. Default: `30`. Range: `0.01`–`730`. Fractional values work (e.g. `0.04` ≈ 1 hour).

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
  "id": "sha256-hash-of-content-and-filename",
  "url": "https://media.pollinations.ai/{hash}",
  "contentType": "image/jpeg",
  "size": 123456,
  "duplicate": false,
  "expiresAt": "2026-06-26T04:00:00.000Z",
  "retentionDays": 30
}
```

**Errors:**
- `400` - No file provided, empty file, invalid JSON/base64, or `days` out of range
- `401` - Missing or invalid API key
- `413` - File too large (max 50MB)

### `GET /:hash`

Retrieve a media file by its hash.

**Response:**
- Binary file with correct `Content-Type`
- `Cache-Control: public, max-age=31536000, immutable`
- Returns `410 Gone` if the file has expired

**Headers:**
- `Content-Type` - MIME type
- `Cache-Control` - `public, max-age=31536000, immutable`
- `X-Content-Hash` - 16-char hex content hash
- `X-Content-Size` - File size in bytes
- `X-Expires-At` - ISO-8601 expiry timestamp (when set)

**Errors:**
- `400` - Invalid hash format
- `404` - File not found
- `410` - File has expired

### `HEAD /:hash`

Check if a file exists without downloading.

**Response:**
- `200` with metadata headers if exists
- `404` if not found
- `410` if expired

### `GET /:hash/metadata`

Returns file metadata as JSON without downloading the file body.

**Response:**
```json
{
  "hash": "a3f2b1c4d5e6f7...",
  "contentType": "image/jpeg",
  "size": 123456,
  "uploadedAt": "2026-05-27T10:00:00.000Z",
  "expiresAt": "2026-06-26T10:00:00.000Z",
  "retentionDays": 30
}
```

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

# Apply R2 lifecycle rules
npm run apply-lifecycle:production
```

## 📊 Limits

- **Max file size:** 50MB
- **Storage:** Cloudflare R2
- **Default retention:** 30 days (re-uploading resets the timer to the new value)
- **Min retention:** 0.01 days (~14 minutes); supports `0.04` ≈ 1h for short-lived uploads
- **Max retention:** 730 days (~2 years)

## 🔒 Content Addressing

Files are stored using a truncated SHA-256 hash (16 hex characters = 64 bits) as the key:
- **Deduplication:** Uploading the same file twice returns the same URL
- **Immutable:** Once uploaded, content cannot change (hash = content)
- **Cacheable:** Files are served with `Cache-Control: public, max-age=31536000, immutable` — content-addressed URLs are safe to cache forever because the URL → bytes mapping is fixed
- **Collision resistance:** Birthday-paradox collision expected around ~4 billion files

## 📌 Retention Policy

- **Configurable retention:** Set `?expires` at upload time (float days, default 30, range 0.01–730).
- **Expiry:** Files return `410 Gone` after their `expiresAt` timestamp. A daily cleanup job removes expired objects from storage.
- **Re-upload resets expiry:** Re-uploading the same file updates `expiresAt`.
- **No delete endpoint:** Content-addressed storage is append-only. Files cannot be manually deleted via the API.
- **No user file listing:** There is no endpoint to list or manage your uploaded files.
- **Abuse/copyright:** For takedown requests, contact the Pollinations team.

## 🔑 Authentication

Uploads require a pollinations.ai API key (`pk_` or `sk_`). Get one at [enter.pollinations.ai](https://enter.pollinations.ai).

Pass the key via:
- `Authorization: Bearer <key>` header (recommended)
- `?key=<key>` query parameter

Retrieval (`GET /:hash`, `HEAD /:hash`, `GET /:hash/metadata`) is **public** — no authentication required.

---

Built with 🌸 by [Pollinations.AI](https://pollinations.ai)
