# SlidePainter

AI-powered narrative slideshow creator. Generate beautiful image sequences with synchronized prompts and narration.

## Development

```bash
# Install dependencies
npm install

# Run development server on port 5175
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Environment Variables

Create a `.env` file in the root directory:

```env
VITE_OPENAI_API_KEY=your_openai_api_key
VITE_POLLINATIONS_AI_TOKEN=your_pollinations_token
```

## Features

- **AI Image Generation** - Generate images using Pollinations API
- **Narrative Prompts** - Create prompts for each slide section
- **Admin Tools** - Section management, editing, and export capabilities
- **Image Pool System** - Pre-generate and manage multiple image variants
- **Markdown Export** - Export your configuration to markdown format

## Controls

- **Navigation Arrows** - Move between sections
- **Add/Delete Sections** - Manage your slideshow structure
- **Edit Prompts** - Modify system prompts and section narratives
- **Regenerate Images** - Generate new images for sections

---

Part of the myceli.ai project
