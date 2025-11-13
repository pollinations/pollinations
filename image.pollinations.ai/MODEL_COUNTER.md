# Model Request Counter

Simple JSON-based logging that tracks how many requests each image model receives.

## How it works

- Each image generation request increments a counter for the model used
- Counters are stored in `model-requests.json` in the repo root
- File is auto-created on first request
- Updates happen synchronously on each request

## API Endpoint

**GET `/model-stats`**

Returns current model request counts as JSON:

```bash
curl http://localhost:16384/model-stats
```

Response:
```json
{
  "flux": 1234,
  "nanobanana": 567,
  "kontext": 890,
  "seedream": 432,
  "gptimage": 123
}
```

## File format

```json
{
  "flux": 1234,
  "nanobanana": 567,
  "kontext": 890,
  "seedream": 432,
  "gptimage": 123
}
```

## Implementation

- `src/modelCounter.ts` - Counter logic
- `src/createAndReturnImages.ts` - Increments counter in `generateImage()` function
- `model-requests.json` - Counter data (gitignored)

## Notes

- File is gitignored to avoid commit noise
- Errors are silently caught to not affect image generation
- Counter persists across server restarts
