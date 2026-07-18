## Image Generation

Generate images from text prompts via a simple GET request. Returns JPEG or PNG.

```
https://gen.pollinations.ai/image/a%20cat%20in%20space?model=flux
```

Successful requests are cached by prompt and parameters. To regenerate and
replace an existing entry after a backend correction, authenticated requests
can add `no-cache=true`.

**Available models:** {{IMAGE_MODELS}}
