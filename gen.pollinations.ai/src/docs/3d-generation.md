## 3D Generation

Generate 3D models from text prompts and images via a simple GET request.
Returns glTF Binary in GLB format. Depending on the model, certain models
ignore text inputs — any text prompt passed to the Trellis 2 family will be
ignored; only the image URL is used.

https://gen.pollinations.ai/3d/no_prompt_for_trellis_needed?model=trellis-2&resolution=low&key=YOUR_KEY_HERE&image=IMAGE_URL_HERE

**Available models:** {{3D_MODELS}}

> **Note:** `hyper3d-rodin` requires Paid Pollen. `trellis-2` (the default)
> supports `low`, `medium`, and `high` resolution and works with Quest Pollen.
