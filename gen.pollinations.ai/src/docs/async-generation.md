## Asynchronous Generation Jobs

Long-running generations (video, audio, 3D, and large images) can be submitted asynchronously: the request returns immediately with a job id, and the finished media is collected later without holding a connection open.

Send `Prefer: respond-async` on the normal generation request. The worker acknowledges the job with `202` and a `status_url` instead of waiting for the model:

```bash
curl -X POST "https://gen.pollinations.ai/v1/images/generations" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: respond-async" \
  -d '{"model":"flux","prompt":"a cat in space"}'
```

```json
{
  "id": "a1b2c3d4...64 hex characters...",
  "status": "pending",
  "status_url": "https://gen.pollinations.ai/v1/jobs/a1b2c3d4...64 hex characters..."
}
```

Poll `GET /v1/jobs/{id}` until the job settles. While the job runs the status is `pending`; when it finishes the response carries a private `result_url`:

```bash
curl "https://gen.pollinations.ai/v1/jobs/a1b2c3d4...64 hex characters..." \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```json
{
  "id": "a1b2c3d4...64 hex characters...",
  "status": "succeeded",
  "result_url": "https://gen.pollinations.ai/v1/jobs/a1b2c3d4...64 hex characters.../result"
}
```

Fetch `GET /v1/jobs/{id}/result` with the same API key to download the media:

```bash
curl "https://gen.pollinations.ai/v1/jobs/a1b2c3d4...64 hex characters.../result" \
  -H "Authorization: Bearer YOUR_API_KEY" -o result.bin
```

Failures settle with `status: "failed"` and an `error` object carrying the provider's `http_status` and `message`.

**Behavior**

- The job is billed once, when it settles, exactly like a synchronous request.
- Only the account that submitted the job can read its status or result; other callers receive `404`.
- Results are kept private for a limited time (they are not public media URLs) and then expire with `404`.
- The job survives client disconnects: the request is persisted and executed in the background.
