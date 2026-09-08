## Media Storage

Upload images, audio, and video and get back an id and URL. By default, each upload gets a new random id.

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

**Custom IDs.** Add `id` to either format (for example, `-F id=cover.png` or `"id": "cover.png"`). IDs are case-sensitive, start with a letter or digit, and contain up to 128 letters, digits, dots, underscores, or hyphens. A user-owned API key is required. The returned id includes an opaque account prefix; use the returned URL for retrieval. The same ID works independently for different accounts. Existing files or gallery entries return `409` without replacement, including on retries.

Untagged files cannot be deleted. They expire after 30 days, but reads refresh retention once a file is at least 15 days old. An ID can be reused only once its file and any gallery entry are gone. A failed upload can still leave its ID occupied, so a retry may return `409`. Custom-ID files are served with `Cache-Control: no-store`.

**Tags publish (alpha).** An optional `tags` field (comma-separated string, or a JSON array in the JSON format) publishes the upload into each tag's public gallery, where anyone can list it via `GET /media?tag={tag}`. Untagged uploads stay unlisted; all retrieval URLs are public, not access-controlled. Knowing one custom URL makes other predictable names in that account guessable. Full endpoint reference: https://media.pollinations.ai/openapi.json
