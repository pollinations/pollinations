## Media Storage

Upload images, audio, and video and get back a unique id and URL. Each upload gets its own id (re-uploading the same bytes yields a new one).

Base URL: https://media.pollinations.ai

| Endpoint | Description |
|----------|-------------|
| `POST /upload` | Upload a file, receive a unique media URL |
| `GET /{id}` | Retrieve a previously uploaded file |
| `GET /{id}/metadata` | Get file metadata as JSON |
| `GET /media?tag={tag}` | List the public gallery for a tag (no auth) |
| `DELETE /media/{id}` | Delete a published item you own (secret `sk_` key) |

Upload requires an API key; retrieval is public. The decoded/file-size limit is 100MB for both upload formats. Files use a 30-day lifecycle from upload or the latest refresh. Retrieving the file body refreshes that lifecycle only when the object is at least 15 days old; metadata and HEAD requests do not refresh it. Two upload formats are accepted:

Multipart form (browsers, files on disk):

```bash
curl -X POST "https://media.pollinations.ai/upload" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F file=@path/to/image.png
```

Base64 JSON (programmatic callers that already hold the bytes):

```bash
curl -X POST "https://media.pollinations.ai/upload" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"data": "<base64-or-data-uri>", "contentType": "image/png", "name": "image.png"}'
```

**Tags publish (alpha).** An optional `tags` field (comma-separated string, or a JSON array in the JSON format) publishes the upload into each tag's public gallery, where anyone can list it via `GET /media?tag={tag}`. Untagged uploads stay unlisted — reachable only by their unguessable id URL. Full endpoint reference: https://media.pollinations.ai/openapi.json

## S3-compatible Storage API (Phase 1 — bearer auth)

A subset of the S3 API is available at `https://media.pollinations.ai/s3/`. This is a thin proxy to R2 that adds Pollinations authentication and per-user namespace isolation.

**Authentication.** All requests require `Authorization: Bearer YOUR_SK_KEY`. Publishable (`pk_`) keys are **read-only** through this API; all write operations require a secret (`sk_`) key. SigV4 signature auth (`aws s3`, boto3, rclone) is **not yet implemented** — bearer auth only in this phase.

**Key layout.** All objects are stored under `{userId}/{accessType}/{rest}`:

| Prefix | Visibility |
|--------|------------|
| `public/...` | Anyone can read via URL |
| `private/...` | Owner's key only |

Ownership is the prefix — there are no per-object permissions. The `{userId}` segment is derived automatically from the bearer token and is not part of the path you provide.

**Operations.**

| Method | Path | Description |
|--------|------|-------------|
| `GET /s3/` | `?list-type=2` | ListObjectsV2 |
| `GET /s3/{key}` | | GetObject (honours `Range` header) |
| `HEAD /s3/{key}` | | HeadObject |
| `PUT /s3/{key}` | | PutObject (streaming; `sk_` only) |
| `DELETE /s3/{key}` | | DeleteObject (`sk_` only) |
| `POST /s3/{key}` | `?uploads` | CreateMultipartUpload (`sk_` only) |
| `PUT /s3/{key}` | `?partNumber={n}&uploadId={id}` | UploadPart (`sk_` only) |
| `POST /s3/{key}` | `?uploadId={id}` | CompleteMultipartUpload (`sk_` only) |
| `GET /s3/presign` | `?key={key}&ttl={seconds}` | Get a presigned PUT URL for browser uploads |
| `PUT /s3/upload` | `?token={presigned-token}` | Browser upload via presigned URL (no `Authorization` needed) |

**Presigned browser uploads.** To upload from a browser without embedding credentials in your page, request a presigned URL from `GET /s3/presign?key=public/myfile.png` (requires `sk_` key, server-side only). The returned URL can be used for a PUT request directly from the browser with no `Authorization` header.

**Note.** Multipart upload is mandatory for objects at the 8 MB threshold. The API handles `aws-chunked` framing automatically. Path traversal (`../`) is rejected. `{userId}/` prefix isolation is enforced on every operation.

```bash
# Upload via bearer auth
curl -X PUT "https://media.pollinations.ai/s3/public/myfile.txt" \
  -H "Authorization: Bearer YOUR_SK_KEY" \
  -H "Content-Type: text/plain" \
  --data "hello world"

# Download
curl "https://media.pollinations.ai/s3/public/myfile.txt" \
  -H "Authorization: Bearer YOUR_SK_KEY"

# List your objects
curl "https://media.pollinations.ai/s3/?list-type=2" \
  -H "Authorization: Bearer YOUR_SK_KEY"
```
