# CarouselCraft AI

AI-powered Instagram Carousel Generator that creates cohesive 3-slide carousels with images and captions.

## What it does

1. User enters a DeFi/Crypto topic
2. Pollinations text API (openai model) generates 3 image prompts + Instagram caption
3. Pollinations image API (flux model) creates 3 matching carousel slides in parallel
4. Displays all images with prompts and the complete caption

## Pollinations APIs used

- **Text generation**: `gen.pollinations.ai/v1/chat/completions` (openai model)
- **Image generation**: `gen.pollinations.ai/v1/images/generations` (flux model)

## How to run locally

```bash
# No build step needed — pure HTML/JS
# Just open index.html in a browser
open index.html
```

## Attribution

Built with [Pollinations.ai](https://pollinations.ai) — open-source generative AI for everyone.

## License

MIT
