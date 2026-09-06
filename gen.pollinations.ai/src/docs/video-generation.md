## Video Generation

Generate videos from text prompts or reference images. Returns MP4.

```
https://gen.pollinations.ai/video/sunset%20timelapse?model=veo&duration=4
```

**Available models:** {{VIDEO_MODELS}}

### Community video models

Community video models use an `owner/model` id and work on `/video/{prompt}`, `/image/{prompt}`, and `/v1/images/generations`. See `/video/models` for the live catalog and [Publish a Model](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_MODEL.md) for the synchronous publisher contract.
