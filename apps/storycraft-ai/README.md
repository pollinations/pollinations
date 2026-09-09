# 📖 StoryCraft AI

**StoryCraft AI** is an interactive, digital storybook and comic creator powered by [Pollinations.ai](https://pollinations.ai) APIs.

Transform simple ideas and prompts into rich, multi-chapter illustrated stories with custom visual styles (Fantasy, Anime, Watercolor, Sci-Fi, Retro Comic, 3D Animation).

---

## ⚡ Powered by Pollinations.ai

StoryCraft AI makes active, real-time use of both Pollinations core APIs:

1. **Text Generation API (`https://text.pollinations.ai`)**:
   - Generates structured story narratives, dynamic chapter headings, and tailored visual scene prompts using OpenAI, Mistral, Qwen, and DeepSeek models.
   - Endpoint: `https://text.pollinations.ai/{prompt}?model={model}&system={systemPrompt}&json=true`

2. **Image Generation API (`https://image.pollinations.ai`)**:
   - Dynamically renders high-resolution scene artwork for each chapter using state-of-the-art image models (FLUX.1 Schnell, SDXL Turbo).
   - Endpoint: `https://image.pollinations.ai/prompt/{prompt}?width=1024&height=1024&seed={seed}&model={model}&nologo=true`

---

## 🚀 Features

- **Multi-Chapter Story Generator**: Choose 3 to 5 chapters for quick tales or epic journeys.
- **Visual Scene Director**: Automatically crafts matching visual prompts tailored to your selected art style.
- **Interactive Storybook Reader**: Flip through chapters with artwork previews, chapter badges, and dots navigation.
- **Redraw Scene**: Re-roll seeds on the fly for any specific chapter.
- **Copy / Export**: Copy full formatted stories with a single click.

---

## 🛠️ Local Development

Open `index.html` in any modern web browser or serve locally:

```bash
# Using Python
python -m http.server 3000

# Or using Node.js http-server / npx serve
npx serve .
```
