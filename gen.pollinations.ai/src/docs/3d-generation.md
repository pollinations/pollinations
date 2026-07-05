## Image Generation

Generate 3D models from text prompts and images via a simple GET request. Returns GTLF Binary in the GLB Format.
Depending on the model, certain models ignore text inputs. For example, any text prompt you pass to the Trellis 2
family will be ignored, with only the image url being taken into account.

```
https://gen.pollinations.ai/3d/your_prompt_here?model=trellis-2-low&key=YOUR_KEY_HERE&image=IMAGE_URL_HERE
```

**Available models:** {{3D_MODELS}}
