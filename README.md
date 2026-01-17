<div align="center">
  <img src="assets/logo-text.svg" alt="pollinations.ai" width="100%"/>
  
  <p><strong>Open-source AI for people who make things.</strong></p>

[![Stars](https://img.shields.io/github/stars/pollinations/pollinations?style=flat-square&logo=github)](https://github.com/pollinations/pollinations)
[![License](https://img.shields.io/github/license/pollinations/pollinations?style=flat-square)](LICENSE)
[![Discord](https://img.shields.io/discord/885844321461485618?style=flat-square&logo=discord&label=Discord&color=5865F2)](https://discord.gg/pollinations-ai-885844321461485618)

[Website](https://pollinations.ai) · [Dashboard](https://enter.pollinations.ai) · [API Docs](APIDOCS.md) · [Discord](https://discord.gg/pollinations-ai-885844321461485618)

</div>

## 🆕 Recent Apps

| Name | Description | Author |
|------|-------------|--------|
| [Korpi.AI](https://korpi.ai) | Generates AI stories with the Pollinations Flux model. | @Reksely |
| [PolliDev](https://fabioarieira.com/pollidev/) | Developer-focused tool for managing generative image assets and prompts. | @FabioArieiraBaia |
| [Lapse Game 2075](https://makeypocket.github.io/LapseGame/) | AI-powered game where decisions shape a country's future over four pillars | @makeypocket |
| [PixArt AI](https://apps.apple.com/us/app/pixart-ai-ai-image-generator/id6749236127) | iOS app that turns text prompts into AI-generated artwork via Pollinations. | @bhyahmed86-maker |
| Polly IDE | IDE to generate Angular and React sites using Pollinations AI models | @nulls-brawl-site |
| [SteamKit](https://steamkit.dev/) | AI toolkit for Steam developers to generate marketing and store page assets. | @zouspants123321 |
| [CHATTY AI](https://ai.studio/apps/drive/1LrJOAZdc-qwB__D736EjWboWs4PPrjYK) | Enhance and update CHATTY AI web app to work seamlessly on Free Tier. | @tefa2007h-dev |
| [Presintation web site](https://astro-prezintatsiya.vercel.app/) | AI-powered web app that creates professional presentations in seconds. | @cyberuz001 |
| [Resonance](https://resonanceai.netlify.app) | Mobile-first image generator with many styles and features (Z Image Turbo, Flux) | @Bakhshi7889 |
| [Ai chatbot](https://t.me/vriskas_channel) | Chat with a powerful AI neural-network chatbot for free on Telegram. | @VriskasYT |

[View all apps →](apps/APPS.md)
## 🚀 New Unified API — Now Live

We've launched **https://gen.pollinations.ai** — a single endpoint for all your AI generation needs: text, images, audio, video — all in one place.

### What's New

- **Unified endpoint** — single API at `gen.pollinations.ai` for all generation
- **Pollen credits** — simple pay-as-you-go system ($1 ≈ 1 Pollen)
- **All models, one place** — Flux, GPT-5, Claude, Gemini, Seedream, and more
- **API keys** — publishable keys for frontend, secret keys for backend

> Get started at [enter.pollinations.ai](https://enter.pollinations.ai) and check out the [API docs](https://enter.pollinations.ai/api/docs)

## 🆕 Latest News

- **2026-01-05** – **🤖 Gemini Agent Tools** Enable `google_search`, `code_execution`, and `url_context` on Gemini models. [API Docs](https://enter.pollinations.ai/api/docs)
- **2026-01-05** – **🚀 Qwen3-Coder** New `Qwen3-Coder-30B` model available for advanced code generation tasks.
- **2026-01-05** – **🎨 Flux Returns** The popular `flux` model is back as a standalone option for image generation.
- **2026-01-05** – **✨ High-Res Upscaling** Generate images larger than 1280x1280 using the new integrated SPAN 2x upscaler.
- **2025-12-29** – **🚀 New Model: GPT Image Large** Access GPT Image 1.5 via the `gptimage-large` model ID for high-fidelity generations. [API Docs](https://enter.pollinations.ai/api/docs)
- **2025-12-29** – **🤖 DeepSeek V3.2** Upgraded to the latest DeepSeek V3.2 for smarter, faster chat responses. [Try it](https://hello.pollinations.ai)
- **2025-12-29** – **🎨 Image-to-Image Upgrades** Now supports multiple input images (pipe-separated) and automatic resizing for better results.
- **2025-12-29** – **📱 New Community Apps** Try IDPhotoGen (ID photos), PromptPi (prompt engineering), and Nuvole AI Lite (iOS shortcut).

---

## 🌟 Introduction

[pollinations.ai](https://pollinations.ai) is an open-source generative AI platform based in Berlin, powering 500+ community projects with accessible text, image, video, and audio generation APIs. We build in the open and keep AI accessible to everyone—thanks to our amazing supporters.

## 🚀 Key Features

- 🔓 **100% Open Source** — code, decisions, roadmap all public
- 🤝 **Community-Built** — 500+ projects already using our APIs
- 🌱 **Pollen Tiers** — earn daily credits by contributing (tiers in beta)
- 🖼️ **Image Generation** — Flux, GPT Image, Seedream, Kontext
- 🎬 **Video Generation** — Seedance, Veo (alpha)
- 🎵 **Audio** — Text-to-speech and speech-to-text
- 🎣 **_Easy-to-use React hooks_** ([React Hooks Examples](https://react-hooks.pollinations.ai/))

<a href="https://star-history.com/#pollinations/pollinations&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=pollinations/pollinations&type=Date&theme=dark" width="600" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=pollinations/pollinations&type=Date" width="600" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=pollinations/pollinations&type=Date" width="600" />
 </picture>
</a>

## 🚀 Getting Started

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/pollinations/pollinations)

### Image Generation

```bash
curl 'https://gen.pollinations.ai/image/a%20beautiful%20sunset' -o image.jpg
```

Or visit [pollinations.ai](https://pollinations.ai) for an interactive experience.

### Text Generation

```bash
curl 'https://gen.pollinations.ai/text/Hello%20world'
```

### Audio Generation

```bash
curl 'https://gen.pollinations.ai/v1/chat/completions' \
  -H 'Content-Type: application/json' \
  -d '{"model": "openai-audio", "messages": [{"role": "user", "content": "Say hello"}], "modalities": ["text", "audio"], "audio": {"voice": "nova", "format": "wav"}}'
```

Explore voices at [OpenAI.fm](https://www.openai.fm/).

### MCP Server for AI Assistants

Our MCP (Model Context Protocol) server enables AI assistants like Claude to generate images and audio directly. [Learn more](./packages/mcp/README.md)

#### Configuration

Add this to your MCP client configuration:

```json
{
  "mcpServers": {
    "pollinations": {
      "command": "npx",
      "args": ["@pollinations/model-context-protocol"]
    }
  }
}
```

### Run with npx (no installation required)

```bash
npx @pollinations/model-context-protocol
```

Community alternatives like [MCPollinations](https://github.com/pinkpixel-dev/MCPollinations) and [Sequa MCP Server](https://mcp.sequa.ai/v1/pollinations/contribute) are also available.

AI assistants can:

- Generate images from text descriptions
- Create text-to-speech audio with various voice options
- Play audio responses through the system speakers
- Access all pollinations.ai models and services
- List available models, voices, and capabilities

For more advanced usage, check out our [API documentation](APIDOCS.md).

## 🔐 Authentication

Get your API key at [enter.pollinations.ai](https://enter.pollinations.ai)

### Key Types

| Key             | Prefix | Use Case                       | Rate Limits              | Status  |
| --------------- | ------ | ------------------------------ | ------------------------ | ------- |
| **Publishable** | `pk_`  | Client-side, demos, prototypes | 1 pollen per IP per hour | ⚠️ Beta |
| **Secret**      | `sk_`  | Server-side only               | No rate limits           | Stable  |

> ⚠️ **Publishable keys:** Turnstile protection coming soon. Not recommended for production yet.

> ⚠️ **Never expose `sk_` keys** in client-side code, git repos, or public URLs

> 💡 **Building an app?** Use [Bring Your Own Pollen](./BRING_YOUR_OWN_POLLEN.md) — users pay for their own usage, you pay $0

### Model Restrictions

Each API key can be scoped to specific models. When creating a key at [enter.pollinations.ai](https://enter.pollinations.ai), you can:

- **Allow all models** — key works with any available model
- **Restrict to specific models** — select exactly which models the key can access (e.g., only `flux` and `openai`, or just `gptimage-large`)

### Usage

```bash
curl 'https://gen.pollinations.ai/image/a%20cat?key=YOUR_KEY'
```

**Environment variable (best practice):**

```bash
export POLLINATIONS_API_KEY=sk_...
```

See [full API docs](APIDOCS.md) for detailed authentication information.

## 🖥️ How to Use

### Web Interface

Our web interface is user-friendly and doesn't require any technical knowledge. Simply visit [https://pollinations.ai](https://pollinations.ai) and start creating!

### API

Use our API directly in your browser or applications:

    https://pollinations.ai/p/conceptual_isometric_world_of_pollinations_ai_surreal_hyperrealistic_digital_garden

Replace the description with your own, and you'll get a unique image based on your words!

## 🎨 Examples

### Image Generation

Here's an example of a generated image:

<img width="1536" height="672" alt="pollinations.ai Logo" src="https://github.com/user-attachments/assets/50444d68-5423-44e7-9dd1-13c5b15b86ce" />

Python code to download the generated image:

    import requests

    def download_image(prompt):
        url = f"https://pollinations.ai/p/{prompt}"
        response = requests.get(url)
        with open('generated_image.jpg', 'wb') as file:
            file.write(response.content)
        print('Image downloaded!')

    download_image("conceptual_isometric_world_of_pollinations_ai_surreal_hyperrealistic_digital_garden")

### Text Generation

To generate text:

    https://gen.pollinations.ai/text/What%20is%20artificial%20intelligence?

### Audio Generation

Use the OpenAI-compatible endpoint with `openai-audio` model:

```bash
curl 'https://gen.pollinations.ai/v1/chat/completions' \
  -H 'Content-Type: application/json' \
  -d '{"model": "openai-audio", "messages": [{"role": "user", "content": "Hello"}], "modalities": ["text", "audio"], "audio": {"voice": "nova", "format": "wav"}}'
```

## 🛠️ Integration

### SDK

Check out our [Pollinations SDK](./packages/sdk/README.md) for Node.js, browser, and React integration.

## Architecture

```mermaid
graph LR
    Q[Bots - Discord, Telegram, WhatsApp] --> GEN
    N[30+ Mobile and Web Apps] --> GEN
    A[pollinations.ai Web Frontend] --> GEN
    R[AI Agents - Qwen, Sillytavern, ...] --> GEN
    AI[AI Assistants - Claude] --> MCP[MCP Server]
    MCP --> GEN

    GEN[gen.pollinations.ai] --> ENTER[enter.pollinations.ai Gateway]

    ENTER --> IMG[Image Service]
    ENTER --> TXT[Text Service]

    IMG --> CF[Cloudflare Worker with R2 Cache]
    CF --> B[image-origin.pollinations.ai]
    B --> D[FLUX / GPT Image / Seedream - GPU VMs]

    TXT --> C[text.pollinations.ai]
    C --> SC[Scaleway API]
    C --> DS[Deepseek API]
    C --> G[Azure-hosted LLMs]
    C --> CFM[Cloudflare AI]
```

## 🔮 Future Developments

We're constantly exploring new ways to push the boundaries of AI-driven content creation. Some areas we're excited about include:

- Digital Twins: Creating interactive AI-driven avatars
- Music Video Generation: Combining AI-generated visuals with music for unique video experiences
- Real-time AI-driven Visual Experiences: Projects like our Dreamachine, which create immersive, personalized visual journeys

## 🌍 Our Vision

pollinations.ai envisions a future where AI technology is:

- **Open & Accessible**: We believe AI should be available to everyone — earn daily Pollen by contributing, no credit card required

- **Transparent & Ethical**: Our open-source approach ensures transparency in how our models work and behave

- **Community-Driven**: We're building a platform where developers, creators, and AI enthusiasts can collaborate and innovate

- **Interconnected**: We're creating an ecosystem where AI services can seamlessly work together, fostering innovation through composability

- **Evolving**: We embrace the rapid evolution of AI technology while maintaining our commitment to openness and accessibility

We're committed to developing AI technology that serves humanity while respecting ethical boundaries and promoting responsible innovation. Join us in shaping the future of AI.

## 🤝 Community and Development

We believe in community-driven development. You can contribute to pollinations.ai in several ways:

1. **Coding Assistant**: The easiest way to contribute! Just [create a GitHub issue](https://github.com/pollinations/pollinations/issues/new) describing the feature you’d like to see implemented. The [MentatBot AI assistant](https://mentat.ai/) will analyze and implement it directly! No coding required - just describe what you want.

2. **Project Submissions**: Have you built something with pollinations.ai? [Use our project submission template](https://github.com/pollinations/pollinations/issues/new?template=project-submission.yml) (labeled as **APPS**) to share it with the community and get it featured in our README.

3. **Feature Requests & Bug Reports**: Have an idea or found a bug? [Open an issue](https://github.com/pollinations/pollinations/issues/new) and let us know. Our team and the MentatBot assistant will review it.

4. **Community Engagement**: Join our vibrant [Discord community](https://discord.gg/pollinations-ai-885844321461485618) to:
   - Share your creations
   - Get support and help others
   - Collaborate with fellow AI enthusiasts
   - Discuss feature ideas before creating issues

For any questions or support, please visit our [Discord channel](https://discord.gg/pollinations-ai-885844321461485618) or create an issue on our [GitHub repository](https://github.com/pollinations/pollinations).

## 🗂️ Project Structure

Our codebase is organized into several key folders, each serving a specific purpose in the pollinations.ai ecosystem:

- [`pollinations.ai/`](./app/): The main React application for the Pollinations.ai website.

- [`image.pollinations.ai/`](./image.pollinations.ai/): Backend service for image generation and caching with Cloudflare Workers and R2 storage.

- [`packages/sdk/`](./packages/sdk/): SDK and React component library for Pollinations.ai.

- [`text.pollinations.ai/`](./text.pollinations.ai/): Backend service for text generation.

- [`packages/mcp/`](./packages/mcp/): Model Context Protocol (MCP) server for AI assistants like Claude to generate images directly.

This structure encompasses the frontend website, backend services for image and text generation, and integrations like the Discord bot and MCP server, providing a comprehensive framework for the pollinations.ai platform.

For development setup and environment management, see [DEVELOP.md](./DEVELOP.md).

## 🏢 Supported By

> pollinations.ai is proud to be supported by:

<img width="1536" height="672" alt="image" src="https://github.com/user-attachments/assets/f8c80773-37fd-4675-87f7-69ac118c2183" />

- [Perplexity AI](https://www.perplexity.ai/): AI-powered search and conversational answer engine
- [AWS Activate](https://aws.amazon.com/): GPU Cloud Credits
- [io.net](https://io.net/): Decentralized GPU network for AI compute
- [BytePlus](https://www.byteplus.com/): Official ByteDance cloud services and AI solutions
- [Google Cloud for Startups](https://cloud.google.com/): GPU Cloud Credits
- [NVIDIA Inception](https://www.nvidia.com/en-us/deep-learning-ai/startups/): AI startup support
- [Azure (MS for Startups)](https://azure.microsoft.com/): OpenAI credits
- [Cloudflare](https://developers.cloudflare.com/workers-ai/): Put the connectivity cloud to work for you.
- [Scaleway](https://www.scaleway.com/): Europe's empowering cloud provider
- [Modal](https://modal.com/): High-performance AI infrastructure
- [NavyAI](https://api.navy/): AI API provider for OpenAI o3 and Gemini models
- [Nebius](https://nebius.com/): AI-optimized cloud infrastructure with NVIDIA GPU clusters

## 💚 Support Us

- ☕ **[Ko-fi](https://ko-fi.com/pollinationsai)** — One-time donations
- 💖 **[GitHub Sponsors](https://github.com/sponsors/pollinations)** — Monthly support
- 🌐 **[Open Collective](https://opencollective.com/pollinationsai)** — Transparent funding

## 📣 Stay Connected

[𝕏 Twitter](https://twitter.com/pollinations_ai) · [Instagram](https://instagram.com/pollinations_ai) · [LinkedIn](https://www.linkedin.com/company/pollinations-ai) · [Facebook](https://facebook.com/pollinations) · [Reddit](https://www.reddit.com/r/pollinations_ai/) · [YouTube](https://www.youtube.com/c/pollinations)

## 📜 License

pollinations.ai is open-source software licensed under the [MIT license](LICENSE).

---

Made with ❤️ by the pollinations.ai team
