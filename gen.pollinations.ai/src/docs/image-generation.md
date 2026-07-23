## Image Generation

Generate images from text prompts via a simple GET request. Returns JPEG or PNG.

```
https://gen.pollinations.ai/image/a%20cat%20in%20space?model=flux
```

Successful requests are cached by prompt and parameters. To regenerate and
replace an existing entry after a backend correction, authenticated requests
can add `no-cache=true`.

**Available models:** {{IMAGE_MODELS}}

### Community image models

Community image models use an owner/model id and support text-to-image generation through `/image/{prompt}` and `/v1/images/generations`. For the OpenAI-compatible endpoint, use `response_format: "b64_json"`. URL responses, reference images, and `/v1/images/edits` are not supported for community models yet. See `/image/models` for the live model list and supported endpoints.
