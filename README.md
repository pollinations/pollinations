<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-text-white.svg" />
    <img src="assets/logo-text-black.svg" alt="pollinations.ai" width="100%" />
  </picture>

  <p><strong>Open-source APIs and infrastructure for text, image, audio, and video generation.</strong></p>

[![Stars](https://img.shields.io/github/stars/pollinations/pollinations?style=flat-square&logo=github)](https://github.com/pollinations/pollinations)
[![License](https://img.shields.io/github/license/pollinations/pollinations?style=flat-square)](LICENSE)
[![Discord](https://img.shields.io/discord/885844321461485618?style=flat-square&logo=discord&label=Discord&color=5865F2)](https://discord.gg/pollinations-ai-885844321461485618)

[Website](https://pollinations.ai) · [Dashboard](https://enter.pollinations.ai) · [API Docs](APIDOCS.md) · [Discord](https://discord.gg/pollinations-ai-885844321461485618)
</div>

<p align="center"><img src="https://media.pollinations.ai/8d8dcfb9bd9905af" alt="Pixel art cozy hackerspace — robot at terminal, nomnom creature eating code, bee with glasses" width="800" height="340" /></p>

`pollinations` is the main monorepo for the Pollinations platform. It contains the public website, the `gen.pollinations.ai` router, the `enter.pollinations.ai` gateway, image and text backends, SDKs, MCP integrations, observability, and the community apps directory.

If you want to build with Pollinations, start with `gen.pollinations.ai` and get your API key at [enter.pollinations.ai](https://enter.pollinations.ai). If you want to work on the platform itself, use the repo map and development docs below.

## Start Here

| Need | Go to |
| --- | --- |
| API reference and examples | [APIDOCS.md](APIDOCS.md) |
| Local development setup | [DEVELOP.md](DEVELOP.md) |
| Contribution guidelines | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Community apps directory | [apps/APPS.md](apps/APPS.md) |
| Build apps without paying for user usage | [BRING_YOUR_OWN_POLLEN.md](BRING_YOUR_OWN_POLLEN.md) |
| SDK usage | [packages/sdk/README.md](packages/sdk/README.md) |
| MCP server | [packages/mcp/README.md](packages/mcp/README.md) |

## Quick Start

1. Create an API key at [enter.pollinations.ai](https://enter.pollinations.ai).
2. Use `https://gen.pollinations.ai` as the base URL.
3. Pick the endpoint that matches your use case.

### Generate an Image

```bash
curl "https://gen.pollinations.ai/image/a%20cat%20in%20space" -o image.jpg
```

### Generate Text

```bash
curl "https://gen.pollinations.ai/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai","messages":[{"role":"user","content":"Hello"}]}'
```

### Generate Audio

```bash
curl "https://gen.pollinations.ai/v1/audio/speech" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"tts-1","input":"Hello from Pollinations","voice":"nova"}' \
  -o speech.mp3
```

For authentication details, model discovery, and the simple GET endpoints for text, image, video, and audio, see [APIDOCS.md](APIDOCS.md).

## Repository Map

| Path | Purpose |
| --- | --- |
| [`pollinations.ai/`](pollinations.ai/README.md) | Main frontend |
| [`gen.pollinations.ai/`](gen.pollinations.ai/README.md) | Edge router and unified public API entrypoint |
| [`enter.pollinations.ai/`](enter.pollinations.ai/README.md) | Auth gateway, billing, tiers, and account APIs |
| [`image.pollinations.ai/`](image.pollinations.ai/README.md) | Image and video backend |
| [`text.pollinations.ai/`](text.pollinations.ai/README.md) | Text backend |
| [`packages/sdk/`](packages/sdk/README.md) | JavaScript SDK |
| [`packages/mcp/`](packages/mcp/README.md) | Model Context Protocol server |
| [`shared/`](shared/README.md) | Shared utilities and registries |
| [`apps/`](apps/README.md) | Community apps and templates |
| [`social/`](social/README.md) | Social and announcement automation |

## Development

Use the root dev scripts when you need to run the main services together:

```bash
npm run dev
```

Useful service-specific commands:

```bash
npm run dev:enter
npm run dev:text
npm run dev:image
```

Local defaults:

- `enter.pollinations.ai`: `http://localhost:3000`
- `text.pollinations.ai`: `http://localhost:16385`
- `image.pollinations.ai`: `http://localhost:16384`

Secrets are managed with SOPS. Full setup, architecture notes, and service workflow details live in [DEVELOP.md](DEVELOP.md).

## 🆕 Recent Apps

| Name | Description | Author |
|------|-------------|--------|
| [🎨 Polli-com](https://polli-com.vercel.app/) | Generate images on mobile with Polli-com, a client-side PWA built on Pollinations.ai with a Prompt Builder, optional local ComfyUI bridge, and role-based access control. | [@abhi5hek1979](https://github.com/abhi5hek1979) |
| [🎬 AI video generator](https://www.tomdacat.com/ai-video-generator/) | Generate videos using the free Seedance model on Pollinations.ai with AI video generator. | [@tomdacatto](https://github.com/tomdacatto) |
| [🎨 Pigment](https://pigment-web.vercel.app/) | Create AI-generated art in the browser with Pigment, a Flask + vanilla JS web app that wraps the Pollinations API with hundreds of art styles and a self-hostable option. | [@SmokePigDad](https://github.com/SmokePigDad) |
| ✍️ PseudoWrite | Replicate a slice of SudoWrite with PseudoWrite, an open source AI story writer that builds a Story Bible and generates long-form fiction through the Pollinations text API. | [@SmokePigDad](https://github.com/SmokePigDad) |
| [🤖 Tawer_bot](https://t.me/tawer_vivybot) | Run a multifunction Telegram bot with AI chat and image generation used by 5000+ people, backed by Pollinations text and image endpoints. | [@tawerrd](https://github.com/tawerrd) |
| [💬 JFOAC](https://github.com/tawerrd/JFOAC) | Chat with AI virtual characters in the browser using JFOAC, a frontend that routes requests through the Pollinations text and image APIs. | [@tawerrd](https://github.com/tawerrd) |
| [🏛️ The Institute of Everything](https://rizperdana.github.io/institute-ai/) | Generate a complete fake museum exhibit from any concept, absurd, niche, or mundane, presented with straight-faced academic seriousness using The Institute of Everything. | [@rizperdana](https://github.com/rizperdana) |
| [🎨 StyleOps](https://styleops.co) | Generate cohesive brand assets from detailed style guides using StyleOps, an AI-powered brand visual generator powered by Pollinations.ai (Flux model). | [@soyoxymor0n](https://github.com/soyoxymor0n) |
| 🤖 Overtli Studio Suite | OVERTLI STUDIO Suite is a collection of nodes for Comfy UI that makes local and cloud AI generation easier through a unified advanced router and specialized media nodes. It uses Pollinations.ai as its | [@OvertliDS](https://github.com/OvertliDS) |
| 🧑‍🎨 Pollinations Avatar Gen - Reforged | Extends the local LLM frontend SillyTavern with Pollinations Avatar Gen - Reforged, an upgraded Reforged extension that builds on Nidelon pollinations-avatar-gen. | [@sunjichaocom](https://github.com/sunjichaocom) |

[View all apps →](apps/APPS.md)
## 🆕 Latest News

- **2026-04-12** – **🧠 Kimi gets a brain upgrade** The `kimi` text model now runs Moonshot's K2-thinking model under the hood. You get reasoning blocks and a massive 128K context window for your largest prompts.
- **2026-04-12** – **⚡ 50x faster text generation** We migrated `deepseek`, `glm`, `minimax`, and `qwen-large` to Fireworks AI. Latency dropped off a cliff, and Qwen got bumped to its 396B flagship version. Try them in the [Unified API](https://gen.pollinations.ai).
- **2026-04-12** – **🖼️ Sana hits 0.165s per image** The default Sana [image model](https://gen.pollinations.ai/image/models) was upgraded to 1.6B and moved to GH200 instances. Better pixels, delivered in a fraction of a second.
- **2026-04-12** – **🌐 Client-side OpenAI SDK support** We adjusted our CORS headers so standard OpenAI SDKs now work directly from the browser. Build your frontend apps without fighting preflight errors.
- **2026-04-10** – **⚡ DeepSeek & Kimi Upgrades** Migrated DeepSeek and Kimi to new infrastructure. Expect significantly fewer dropped connections and faster response times when chatting in the [Playground](https://pollinations.ai/play).
- **2026-04-10** – **🌍 Gemini Flash Lite Routing** Rerouted Gemini 2.5 Flash Lite to global endpoints to pool quota. It should now actually survive when everyone tries to hit the [Text API](https://gen.pollinations.ai/v1/chat/completions) at the exact same time.
- **2026-04-09** – **🚀 Heavyweight models hit the free tier** GPT-5.4, Grok, and Qwen Coder are now free to use. We also wired up Mistral-Large-3 and Grok-4-20 to the [text endpoint](https://gen.pollinations.ai/v1/models).
- **2026-04-09** – **🎨 Premium pixels, zero cost** `gptimage-large` and `FLUX.1 Kontext` have been moved off the paid tier. Send a prompt, get high-quality pixels back.
- **2026-04-09** – **🛠️ Dreamframe** A zero-dependency, single-HTML-file playground for testing image, video, voice, and music generation. View source, learn, steal. [Try it](https://funniman23.github.io/Dreamframe/) <!-- app -->
- **2026-04-09** – **🎭 SillyTavern avatar generation** A new extension lets you generate and update character avatars via our image API directly inside your local LLM frontend. [View repo](https://github.com/sunjichaocom/pollinations-avatar-gen-reforged) <!-- app -->

## Community

- Join the [Discord server](https://discord.gg/pollinations-ai-885844321461485618).
- Browse or open [GitHub issues](https://github.com/pollinations/pollinations/issues).
- Read the contribution guide in [CONTRIBUTING.md](CONTRIBUTING.md).
- Explore community app templates and submission guidance in [apps/README.md](apps/README.md).

## License

pollinations.ai is open-source software licensed under the [MIT license](LICENSE).
