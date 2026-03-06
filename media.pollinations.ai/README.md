# media.pollinations.ai 📦

> Content-addressed media upload service for Pollinations

Upload files and get back a content-addressed URL to use with Pollinations models.

## 🎯 What it does

- **Upload** media files via `POST /upload`
- **Retrieve** media by hash via `GET /:hash`
- **Deduplicate** - identical files return the same URL (SHA-256 content hashing)
- **CORS enabled** for browser uploads

## 🚀 Quick Start

### Upload a file

Uploads require a pollinations.ai API key. Get one at [enter.pollinations.ai](https://enter.pollinations.ai).

```bash
curl -X POST https://media.pollinations.ai/upload \
  -H "Authorization: Bearer <your-api-key>" \
  -F "file=@image.jpg"

# Returns:
# {
#   "id": "a3f2b1c4d5e6f7...",
#   "url": "https://media.pollinations.ai/a3f2b1c4d5e6f7...",
#   "contentType": "image/jpeg",
#   "size": 123456,
#   "duplicate": false
# }
```

### Retrieve a file

```bash
curl https://media.pollinations.ai/a3f2b1c4d5e6f7...
# Returns: original file with correct content-type
```

### Check if file exists (HEAD request)

```bash
curl -I https://media.pollinations.ai/a3f2b1c4d5e6f7...
# Returns: 200 with headers, or 404 if not found
```

## 📋 API Reference

### `POST /upload`

Upload a media file. **Requires API key** via `Authorization: Bearer <key>` header or `?key=<key>` query parameter.

**Request:**
- `Content-Type: multipart/form-data` with `file` field

**Response:**
```json
{
  "id": "sha256-hash-of-content-and-filename",
  "url": "https://media.pollinations.ai/{hash}",
  "contentType": "image/jpeg",
  "size": 123456,
  "duplicate": false
}
```

**Errors:**
- `400` - No file provided or not multipart/form-data
- `413` - File too large (max 10MB)

### `GET /:hash`

Retrieve a media file by its hash.

**Response:**
- Binary file with correct `Content-Type`
- `Cache-Control: public, max-age=31536000, immutable`

**Headers:**
- `Content-Type` - MIME type
- `Cache-Control` - `public, max-age=31536000, immutable`
- `X-Content-Hash` - 16-char hex content hash
- `X-Content-Size` - File size in bytes

**Errors:**
- `400` - Invalid hash format
- `404` - File not found

### `HEAD /:hash`

Check if a file exists without downloading.

**Response:**
- `200` with metadata headers if exists
- `404` if not found

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

- **Max file size:** 10MB
- **Storage:** Cloudflare R2
- **Default expiry:** 14 days (re-uploading the same file resets the TTL)

## 🔒 Content Addressing

Files are stored using a truncated SHA-256 hash (16 hex characters = 64 bits) as the key:
- **Deduplication:** Uploading the same file twice returns the same URL
- **Immutable:** Once uploaded, content cannot change (hash = content)
- **Cacheable:** Files are cached for 1 year with `immutable` directive
- **Collision resistance:** Birthday-paradox collision expected around ~4 billion files

## 📌 Retention Policy

- **14-day TTL:** Files expire 14 days after upload. Re-uploading the same file resets the timer.
- **No delete endpoint:** Content-addressed storage is append-only. Files cannot be deleted via the API.
- **No user file listing:** There is no endpoint to list or manage your uploaded files.
- **Abuse/copyright:** For takedown requests, contact the Pollinations team.

## 🔑 Authentication

Uploads require a pollinations.ai API key (`pk_` or `sk_`). Get one at [enter.pollinations.ai](https://enter.pollinations.ai).

Pass the key via:
- `Authorization: Bearer <key>` header (recommended)
- `?key=<key>` query parameter

Retrieval (`GET /:hash`, `HEAD /:hash`) is **public** — no authentication required.

---

Built with 🌸 by [Pollinations.AI](https://pollinations.ai)
