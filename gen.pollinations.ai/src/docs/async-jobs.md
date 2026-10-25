## Asynchronous Media Jobs

Long image, video, audio and 3D generations don't need to hold a connection open. Add `Prefer: respond-async` to a normal media request: an uncached request returns `202 Accepted` right away with a job `id`, a `Location` header and `Retry-After: 5`.

```bash
job=$(curl -sS "https://gen.pollinations.ai/video/a%20paper%20boat%20on%20a%20river?model=google/veo-3.1-fast" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" \
  -H "Prefer: respond-async" | jq -r '.id')
curl -sS "https://gen.pollinations.ai/v1/jobs/$job" -H "Authorization: Bearer $POLLINATIONS_KEY"
curl -sS "https://gen.pollinations.ai/v1/jobs/$job/result" \
  -H "Authorization: Bearer $POLLINATIONS_KEY" -o boat.mp4
```

- Poll `GET /v1/jobs/{id}` until `status` is `succeeded` or `failed`, then download from `result_url`. The result endpoint returns 409 while the job is pending or failed.
- Only accounts that submitted the job can read it. Anyone else gets 404, as do unknown ids and expired results.
- Identical requests join one generation and one charge, and polling never charges. Resubmitting after a failure, or after the cached file has expired, starts and bills a new generation.
- An already cached result may come back directly as HTTP 200, without a job id.
- Job records expire 24 hours after completion; media files keep their normal cache lifetime.
- Works on routes that store a media file: `/image`, `/video`, `/3d`, `/audio/{text}`, `/v1/images/*` and `/v1/audio/speech`. Streaming and text requests ignore `Prefer` and stay synchronous.
