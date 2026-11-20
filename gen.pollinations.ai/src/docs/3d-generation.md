## 3D Generation

Generate 3D models from text prompts and images via a simple GET request.
Returns glTF Binary in GLB format by default. Depending on the model, certain
models ignore text inputs. Any text prompt passed to the Trellis 2/Asset Harvester family will
be ignored; only the image URL is used.

https://gen.pollinations.ai/3d/no_prompt_for_trellis_needed?model=microsoft%2Ftrellis-2&resolution=low&key=YOUR_KEY_HERE&image=IMAGE_URL_HERE

**Available models:** {{3D_MODELS}}

> **Note:** every 3D model requires the paid balance; the Quest balance cannot
> pay for one. `microsoft/trellis-2` (the default) supports `low`, `medium`, and
> `high` resolution. A Quest-funded caller gets `402` on `/3d/{prompt}`.

### NVIDIA Asset Harvester

`nvidia/asset-harvester` generates 3D Gaussian Splat
models in PLY format. Unlike other 3D models that return GLB, Asset Harvester
returns raw PLY binary suitable for real-time rendering in Gaussian Splat
viewers (e.g. SuperSplat, Three.js with Gaussian PLY loader).
