## 3D Generation

Generate 3D models from text prompts and images via a simple GET request.
Returns glTF Binary in GLB format by default. Depending on the model, certain
models ignore text inputs. Prompts sent to TripoSR, Trellis 2, or Asset Harvester
are ignored; these models use only the reference image.

https://gen.pollinations.ai/3d/no_prompt_for_trellis_needed?model=microsoft%2Ftrellis-2&resolution=low&key=YOUR_KEY_HERE&image=IMAGE_URL_HERE

**Available models:** {{3D_MODELS}}

> **Note:** All InferencePort-backed 3D models including `stability-ai/triposr`,
> `microsoft/trellis-2`, and `nvidia/asset-harvester` require Paid Pollen.
> `microsoft/trellis-2` supports `low`, `medium`, and `high` resolution.

### NVIDIA Asset Harvester

`nvidia/asset-harvester` generates 3D Gaussian Splat
models in PLY format. Unlike other 3D models that return GLB, Asset Harvester
returns raw PLY binary suitable for real-time rendering in Gaussian Splat
viewers (e.g. SuperSplat, Three.js with Gaussian PLY loader).

### Stability AI TripoSR (InferencePort AI)

`stability-ai/triposr` (alias `tripoSR`) produces a downloadable GLB from one
reference image, with no text prompt. It requires Paid Pollen and is priced
at **0.10 Pollen per generation** (InferencePort upstream list cost: $0.07).

```bash
curl -X POST 'https://gen.pollinations.ai/3d' \
  -H 'Authorization: Bearer YOUR_POLLINATIONS_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"model":"tripoSR","image_urls":["https://example.com/reference.png"]}' \
  --output model.glb
```

JSON requests also accept an image as `image` (string or URL array), or a
base64-encoded PNG/JPEG/WebP data URI. Supply exactly one image for TripoSR.
The server submits and polls InferencePort's asynchronous job API, returning
only a completed GLB. Failed and refunded jobs do not generate a Pollinations
usage charge. The provider API key stays on the server.
