# pollinations.ai2

Clean, tab-based redesign of pollinations.ai website.

## Architecture

### Tech Stack

-   **Vite** - Fast build tool
-   **React 18** - UI library
-   **React Router v6** - Client-side routing for tabs
-   **Tailwind CSS** - Utility-first CSS framework
-   **shadcn/ui** - Accessible, customizable components
-   **@pollinations/react** - Dynamic text generation (meta use case!)

### Project Structure

```
pollinations.ai2/
├── src/
│   ├── components/
│   │   └── Layout.jsx          # Main layout with header, tabs, footer
│   ├── pages/
│   │   ├── HomePage.jsx         # Landing page (Hero, overview)
│   │   ├── PlaygroundPage.jsx   # Feeds section (Image/Text generation)
│   │   ├── ProjectsPage.jsx     # Community projects showcase
│   │   ├── IntegrationPage.jsx  # API docs and code examples
│   │   └── CommunityPage.jsx    # Discord + Supporters
│   ├── config/
│   │   └── colors.js            # Color system from original site
│   ├── styles/
│   │   └── index.css            # Global styles
│   ├── App.jsx                  # Router configuration
│   └── main.jsx                 # App entry point
├── index.html
├── vite.config.js
└── package.json
```

## Tab Structure

1. **Home** - Landing page with hero and quick overview
2. **Playground** - Interactive image/text generation (Feeds section)
3. **Projects** - Community projects showcase
4. **Integration** - API documentation
5. **Community** - Discord, supporters, resources

## Development

```bash
# Install dependencies
npm install

# Start dev server (runs on port 3001)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Design System

Using the original pollinations.ai color palette:

-   **Lime**: `#ecf874` (primary accent)
-   **Off-white**: `#c7d4d6` (text)
-   **Off-black**: `#110518` (background)
-   **Gray tones**: For secondary elements

**Fonts**:

-   Maven Pro (titles)
-   Mako (headlines)
-   Duru Sans (body text)

## Migration Plan

Each tab will be populated with content from the original site:

-   [ ] Home - Hero section migrated
-   [ ] Playground - Feeds (Image/Text) components
-   [ ] Projects - Projects list with tabs
-   [ ] Integration - API examples
-   [ ] Community - Discord + Supporters

## Dynamic Text Generation

The site uses **AI-generated text** via the Pollinations API (meta use case!).

### How it works:

-   All text is defined as **prompts** in `src/config/content.js`
-   Each element has a **unique seed** for consistent caching
-   Text transforms are in `src/config/transforms.js`
-   Backend caching handles performance (seed-based)

### Example:

```jsx
<TextGenerator
    text={HOME_HERO_TITLE}
    transforms={[rephrase, emojify]}
    seed={1}
/>
```

See `src/config/README.md` for full documentation.

---

## Documentation

-   **[STYLING.md](./STYLING.md)** - Tailwind CSS + shadcn/ui guide
-   **[src/config/README.md](./src/config/README.md)** - Dynamic text generation system

## Next Steps

1. ✅ Basic tab structure
2. ✅ Dynamic text generation system
3. ✅ Tailwind CSS + shadcn/ui installed
4. ✅ HomePage fully migrated (Tailwind + Button component)
5. ⏳ Convert Layout to Tailwind
6. ⏳ Migrate content from original site (Playground, Projects, etc.)
