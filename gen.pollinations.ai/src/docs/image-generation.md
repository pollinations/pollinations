## Image Generation

Generate images from text prompts via a simple GET request. Returns JPEG or PNG.

```
https://gen.pollinations.ai/image/a%20cat%20in%20space?model=flux
```

**Available models:** {{IMAGE_MODELS}}

### Community image models

Community image models use an owner/model id and support generation and editing through `/image/{prompt}`, `/v1/images/generations`, and `/v1/images/edits`. Editing support depends on the registrant's upstream endpoint. OpenAI-compatible responses use `b64_json`; URL responses are not supported for community models. See `/image/models` for the live model list and supported endpoints.
