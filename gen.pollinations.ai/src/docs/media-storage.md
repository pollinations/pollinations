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
