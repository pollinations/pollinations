## Image Generation

Generate images from text prompts via a simple GET request. Returns JPEG, PNG, or SVG depending on the selected model.

```
https://gen.pollinations.ai/image/a%20cat%20in%20space?model=flux
```

Successful requests are cached by prompt and parameters. To regenerate and
replace an existing entry after a backend correction, authenticated requests
can add `no-cache=true`.

**Available models:** {{IMAGE_MODELS}}

### Community image models

Community image models use an owner/model id and support generation through `/image/{prompt}` and `/v1/images/generations`. The registration test adds image input and `/v1/images/edits` metadata when the registrant's edit endpoint succeeds. OpenAI-compatible responses use `b64_json`; URL responses are not supported for community models. See `/image/models` for the live model list and supported endpoints.
