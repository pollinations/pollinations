# Asynchronous Media Jobs

Long image, video, audio, and 3D generations can outlive a client connection.
Instead of holding one request open for minutes, send `Prefer: respond-async`
(RFC 7240) and the API returns a job id immediately. Collect the result whenever
you are ready — across reconnects, restarts, and retries.

```
POST /v1/images/generations      -> 202 { id, status, status_url }
GET  /v1/jobs/{id}               -> { id, status, created_at, completed_at?, result_url?, error? }
GET  /v1/jobs/{id}/result        -> the generated file
```

Submit a video job and disconnect:

```bash
curl -i -X POST https://gen.pollinations.ai/v1/images/generations \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: respond-async" \
  -d '{"model":"flux","prompt":"a slow bee rendering","width":1280,"height":720}'
```

```http
HTTP/1.1 202 Accepted
Location: https://gen.pollinations.ai/v1/jobs/<id>
Retry-After: 5
Preference-Applied: respond-async

{"id":"<id>","status":"pending","status_url":"https://gen.pollinations.ai/v1/jobs/<id>"}
```

Poll the status until it leaves `pending` (a pending response carries
`Retry-After: 5`; every job response is `Cache-Control: private, no-store`):

```bash
curl https://gen.pollinations.ai/v1/jobs/<id> \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY"
# {"id":"<id>","status":"succeeded","created_at":…,"completed_at":…,"result_url":"https://gen.pollinations.ai/v1/jobs/<id>/result"}
```

Download the result:

```bash
curl -L https://gen.pollinations.ai/v1/jobs/<id>/result \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" -o result.bin
```

## Guarantees

- **One generation, one charge per job.** The id is the job's durable cache
  identity, so resending the identical request — or polling as often as you like
  — never starts a second generation or bills twice. A request whose result is
  already cached returns the file directly and is not charged again.
- **Owner-only.** Only an account that submitted the job can read its status or
  result. Unknown ids and ids owned by someone else both return `404`.
- **Durable.** The job runs in the same durable coordinator and is written to the
  same R2 media cache as a synchronous request, so a disconnect never loses work.
  Job records expire 24 hours after completion; result availability is bounded by
  the normal media retention window.

## Notes

- `Prefer: respond-async` is honored on media endpoints that store a file
  (`/image`, `/video`, `/3d`, audio and the OpenAI-compatible `/v1/images/*`).
  Text endpoints stream rather than store a file, so they stay synchronous.
- `/v1/jobs/{id}/result` returns `409` while the job is still running or after it
  failed, and `404` when the id is unknown, owned by someone else, or the result
  has expired.
- The server may ignore `Prefer` and answer `200` with the cached file when the
  result already exists.
