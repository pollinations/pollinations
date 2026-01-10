# Testing Guide - media.pollinations.ai

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Local Development Server
```bash
npm run dev
```

This starts `wrangler dev` on `http://localhost:8790` with a local R2 bucket simulator.

### 3. Run Manual Tests
In a new terminal:
```bash
node test-manual.js
```

This runs a comprehensive test suite covering all endpoints.

---

## 📝 Test Coverage

### Health Check
```bash
curl http://localhost:8790/
```
Returns service info and available endpoints.

### Base64 Upload
```bash
curl -X POST http://localhost:8790/upload \
  -H "Content-Type: application/json" \
  -d '{
    "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "contentType": "image/png",
    "name": "test.png"
  }'
```
**Response:**
```json
{
  "id": "4a13ee75827c4f4bf60883cf2f96bd7d7e50dd6f2f3b96d591dbe8f10db89f36",
  "url": "https://media.pollinations.ai/4a13ee75827c4f4bf60883cf2f96bd7d7e50dd6f2f3b96d591dbe8f10db89f36",
  "contentType": "image/png",
  "size": 68,
  "duplicate": false
}
```

### Multipart Form-Data Upload
```bash
curl -X POST http://localhost:8790/upload \
  -F "file=@image.jpg"
```

### Raw Binary Upload
```bash
curl -X POST http://localhost:8790/upload \
  -H "Content-Type: image/jpeg" \
  --data-binary "@image.jpg"
```

### Retrieve File
```bash
curl http://localhost:8790/{hash} \
  -o downloaded-file
```
Returns the original file with correct `Content-Type` header.

### Check File Metadata (HEAD Request)
```bash
curl -I http://localhost:8790/{hash}
```
Returns headers without downloading the file:
- `X-Content-Hash`: SHA-256 hash
- `X-Content-Type`: MIME type
- `X-Content-Size`: File size in bytes
- `Cache-Control`: Always "public, max-age=31536000, immutable"

### Test Deduplication
Upload the same file twice:
```bash
curl -X POST http://localhost:8790/upload \
  -F "file=@image.jpg"

curl -X POST http://localhost:8790/upload \
  -F "file=@image.jpg"
```
Both requests return the same hash with `duplicate: true` on the second request.

---

## 🧪 Automated Tests

### Run Tests with Vitest
```bash
npm test                # Run once
npm run test:watch      # Watch mode
```

Tests include:
- ✅ Multipart form-data upload
- ✅ Base64 JSON upload
- ✅ Raw binary upload
- ✅ Empty file rejection (400)
- ✅ Missing file rejection (400)
- ✅ Invalid content-type rejection (415)
- ✅ File size limit validation (413)
- ✅ Deduplication (duplicate detection)
- ✅ File retrieval by hash
- ✅ Invalid hash format rejection (400)
- ✅ Not found handling (404)
- ✅ HEAD request support
- ✅ CORS headers

---

## 🔍 Test Scenarios

### Scenario 1: Image Upload via Base64
**Setup:** Generate a base64 PNG from any image
**Test:** POST with JSON body
**Verify:**
- Response status is 200
- `id` is a valid SHA-256 hash (64 hex chars)
- `url` contains the hash
- `contentType` is correct

### Scenario 2: Deduplication
**Setup:** Have two identical image files (byte-for-byte)
**Test:** Upload both to `/upload` endpoint
**Verify:**
- First upload: `duplicate: false`
- Second upload: `duplicate: true`, same hash

### Scenario 3: Error Handling
**Test Cases:**
- Upload empty file → 400
- Upload invalid type (PDF) → 415
- Upload too large file → 413
- Retrieve invalid hash → 400
- Retrieve non-existent hash → 404

### Scenario 4: Content-Type Detection
**Test:** Upload without specifying content-type
**Verify:**
- System detects from file extension
- Correct `Content-Type` header in response

---

## 🚨 Troubleshooting

### "Cannot find module 'hono'"
```bash
npm install
```

### "R2 bucket not found"
This is expected in local development - wrangler uses an in-memory simulator.
For production, the bucket must exist in your Cloudflare R2 account.

### "Port 8790 already in use"
Change port in `wrangler.toml` under `[dev]` section.

### Tests fail with "fetch is not defined"
Ensure you're running with Node 18+ which has built-in `fetch`:
```bash
node --version  # Should be v18.0.0 or higher
```

---

## 📊 Deployment

### Preview Deployment
```bash
npm run deploy
```
Deploys to `*.media.pollinations.ai` (staging)

### Production Deployment
```bash
npm run deploy:production
```
Deploys to `media.pollinations.ai`

---

## 🔗 Integration Example

### JavaScript (Browser)
```javascript
// Upload base64
const response = await fetch('https://media.pollinations.ai/upload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    data: canvas.toDataURL().split(',')[1],  // Strip data URL prefix
    contentType: 'image/png',
    name: 'canvas.png'
  })
});

const { id, url } = await response.json();
console.log(`Use this URL with Pollinations: ${url}`);
```

### Python
```python
import requests
import base64

with open('image.jpg', 'rb') as f:
    data = base64.b64encode(f.read()).decode()

response = requests.post('https://media.pollinations.ai/upload', json={
    'data': data,
    'contentType': 'image/jpeg',
    'name': 'image.jpg'
})

hash_id = response.json()['id']
print(f"https://media.pollinations.ai/{hash_id}")
```

### cURL (Multipart)
```bash
curl -X POST https://media.pollinations.ai/upload \
  -F "file=@image.jpg"
```

---

## ✅ Acceptance Checklist

- [x] Upload endpoint accepts multipart/form-data
- [x] Upload endpoint accepts base64 JSON
- [x] Upload endpoint accepts raw binary
- [x] Returns SHA-256 content-addressed hash
- [x] Stores in R2 bucket with hash as key
- [x] Retrieval endpoint serves with correct content-type
- [x] Duplicate uploads return existing hash
- [x] CORS headers enabled
- [x] TypeScript + Hono implementation
- [x] Manual testing script (`test-manual.js`)
- [x] Error handling (400, 413, 415, 404)
- [x] Cache headers for immutable content
- [x] HEAD request support for metadata
- [x] Health check endpoint
