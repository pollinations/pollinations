## Async generation jobs

Start a long generation now and collect the result later, instead of holding one connection open for minutes.

| Endpoint | Description |
|----------|-------------|
| Any generation route + `Prefer: respond-async` | Submit the generation as a job and get an id back immediately |
| `GET /v1/jobs/{id}` | Job status: `queued` / `processing` / `succeeded` / `failed` |
| `GET /v1/jobs/{id}/result` | The generated content, once the job has succeeded |

Works with image, video, audio and 3D generation. Send the request exactly as you would synchronously — same body, same auth — plus the RFC 7240 header:

```bash
curl -X POST https://gen.pollinations.ai/v1/images/generations \
  -H "Authorization: Bearer $POLLEN_API_KEY" \
  -H "Prefer: respond-async" \
  -H "Content-Type: application/json" \
  -d '{"model":"black-forest-labs/flux.1-schnell","prompt":"a cat on the moon"}'
```

The answer is a job handle, returned right away:

```json
{
  "id": "3f9c1a...e2",
  "status": "queued",
  "urls": {
    "status": "https://gen.pollinations.ai/v1/jobs/3f9c1a...e2",
    "result": "https://gen.pollinations.ai/v1/jobs/3f9c1a...e2/result"
  }
}
```

Poll the status endpoint; while a job is running it answers with a `Retry-After: 2` header. Collect the bytes at the result endpoint — the same response the synchronous call would have returned — once the status is `succeeded`. A result requested too early answers `425 Too Early`. Failed jobs replay the original error response.

Semantics:

- **One generation, one charge.** The id is the SHA-256 of the request identity, so resubmitting the identical request — whether because you disconnected or want the result again — joins the same job rather than starting a new one. Polling and collection are free.
- **Ownership.** Only the account that submitted (or joined) a job can read its status or result.
- **Retention.** Settled jobs stay collectable for 24 hours; the result itself lives in the durable generation cache.

The TypeScript SDK wraps the whole cycle:

```ts
import { Pollinations } from "@pollinations/sdk";

const pollinations = new Pollinations({ apiKey: process.env.POLLEN_API_KEY });

const job = await pollinations.submitJob({
  path: "/v1/images/generations",
  body: { model: "black-forest-labs/flux.1-schnell", prompt: "a cat on the moon" },
});

// ...hours later, in another process:
const response = await pollinations.waitForJob(job.id);
const image = await response.arrayBuffer();
```
