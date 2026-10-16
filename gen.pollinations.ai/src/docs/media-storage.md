## Media Storage

Upload images, audio, and video and get back an id and URL. By default, each upload gets a new random id.

Base URL: https://media.pollinations.ai

Stored image, video, audio, and 3D files are linked through `Link: <https://media.pollinations.ai/{id}>; rel="enclosure"`. Image generation and editing preserve this header in both URL and base64 JSON responses; `response_format: "url"` also returns the URL in `data[].url`. Audio JSON responses, such as transcripts and timestamped speech, do not have a stored-file link. Fetching media URLs never triggers generation; missing files return 404. A generated file's ID identifies its request, so a new generation after expiry may replace the file at the same URL. Clients may continue using an older cached result after regeneration.

| Endpoint | Description |
|----------|-------------|
| `POST /upload` | Upload a file, receive a unique media URL |
| `GET /{id}` | Retrieve a previously uploaded file |
| `GET /{id}/metadata` | Get file metadata as JSON |
| `GET /media?tag={tag}` | List the public gallery for a tag (no auth) |
| `DELETE /media/{id}` | Delete a file uploaded with your account's keys (secret `sk_` key) |

Upload requires an API key; retrieval is public. Multipart FormData and raw file uploads can reach 400 MiB through `media.pollinations.ai`. Base64 JSON uploads remain limited to 100 MiB because they buffer the file in Worker memory. Storage is paid in advance (see below). Three upload formats are accepted:

Raw file body (streams to storage; returns a random, unlisted ID):

```bash
curl -X POST "https://media.pollinations.ai/upload" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: video/mp4" \
  -H "X-File-Name: video.mp4" \
  --data-binary @path/to/video.mp4
```

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

**Storage is paid in advance.** Files uploaded with your account's keys cost 0.0075 pollen per GB-month, half of Cloudflare's price (files under 128 KB count as 128 KB), and show in your usage as model `media`. The uploading key pays each period up front, the first right after the upload, so a key that can't pay gets `402`. By default a file stays while it is used: fetching its body in its last 15 paid days renews it for 30 days from then (metadata and HEAD requests don't). `-F "expiresAfter[anchor]=created_at" -F "expiresAfter[seconds]=86400"` deletes it a set time (3600 to 2592000 seconds) after the upload, and `-F expiresAfter=never` renews it until you delete it (secret `sk_` key only). JSON takes `"expiresAfter": "never"` or `{"anchor": "created_at", "seconds": 86400}`. If the key can't pay a renewal, is deleted, or its account is banned, the file is deleted when its paid time ends. Keys without an account, and files from before paid storage, stay free: they expire after 30 days, and reads refresh them once they are at least 15 days old.

Your secret key deletes any file uploaded with your account's keys (`DELETE /media/{id}`). An ID can be reused only once its file and any gallery entry are gone. A failed upload can still leave its ID occupied, so a retry may return `409`. Custom-ID files are served with `Cache-Control: no-store`.

**Tags publish (alpha).** An optional `tags` field (comma-separated string, or a JSON array in the JSON format) publishes the upload into each tag's public gallery, where anyone can list it via `GET /media?tag={tag}`. Untagged uploads stay unlisted; all retrieval URLs are public, not access-controlled. Knowing one custom URL makes other predictable names in that account guessable. Full endpoint reference: https://media.pollinations.ai/openapi.json
