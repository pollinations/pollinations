# SlidePainter

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/pollinations/pollinations/tree/main/apps/slidepainter)
[![Open in Bolt](https://img.shields.io/badge/Open%20in-Bolt.new-black?style=flat-square&logo=stackblitz)](https://bolt.new/?prompt=Clone%20SlidePainter%20from%20https%3A%2F%2Fgithub.com%2Fpollinations%2Fpollinations%2Ftree%2Fmain%2Fapps%2Fslidepainter%20and%20set%20it%20up.%20It%27s%20a%20React%20%2B%20Vite%20slideshow%20creator%20using%20the%20Pollinations%20API%20at%20gen.pollinations.ai.)
[![Open in Lovable](https://img.shields.io/badge/Open%20in-Lovable-ff69b4?style=flat-square)](https://lovable.dev/?autosubmit=true#prompt=Build%20an%20AI-powered%20narrative%20slideshow%20creator.%20Use%20the%20Pollinations%20API%20at%20gen.pollinations.ai%20to%20generate%20image%20sequences%20with%20synchronized%20prompts%20and%20narration.%20React%20%2B%20Tailwind.%20No%20API%20key%20needed.)
[![Open in CodeSandbox](https://img.shields.io/badge/Open%20in-CodeSandbox-blue?style=flat-square&logo=codesandbox)](https://codesandbox.io/s/github/pollinations/pollinations/tree/main/apps/slidepainter)

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
