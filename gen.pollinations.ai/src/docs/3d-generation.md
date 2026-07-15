## 3D Generation

Generate 3D models from text prompts and images via a simple GET request.
Returns glTF Binary in GLB format. Depending on the model, certain models
ignore text inputs — any text prompt passed to the Trellis 2 family will be
ignored; only the image URL is used.

https://gen.pollinations.ai/3d/no_prompt_for_trellis_needed?model=trellis-2-low&key=YOUR_KEY_HERE&image=IMAGE_URL_HERE

**Available models:** {{3D_MODELS}}

> **Note:** `hyper3d-rodin` requires Paid Pollen. `trellis-2-low` (the default),
> `trellis-2-medium`, and `trellis-2-high` work with Quest Pollen.
