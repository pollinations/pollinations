# Pollinations Changelog Generator

A beautiful, AI-powered changelog generator that transforms technical git commits into human-readable updates for the Pollinations repository.

##  Features

- **AI-Enhanced Descriptions** - Converts technical commit messages into friendly, understandable changelog entries
- **Smart Categorization** - Automatically categorizes commits by type (features, bug fixes, documentation, etc.)
- **Flexible Grouping** - View changes grouped by date or category
- **Export Options** - Download changelogs as Markdown or plain text
- **Real-time Progress** - Live progress tracking during generation
- **Clean UI** - Modern, responsive design built with Tailwind CSS

##  Quick Start

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Start development server**

   ```bash
   npm run dev
   ```

3. **Generate changelog**
   - Click "Generate Changelog" to fetch the latest commits from the Pollinations repository
   - Watch as AI transforms each commit into readable changelog entries
   - Export your changelog in your preferred format

##  Built With

- **React 18** - Modern React with hooks
- **Vite** - Fast build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Beautiful icons
- **Day.js** - Lightweight date manipulation
- **Axios** - HTTP client for API requests
- **Pollinations AI** - AI service for generating human-readable descriptions

##  How It Works

1. **Fetch Commits** - Retrieves the latest 50 commits from the GitHub API
2. **Categorize** - Analyzes commit messages to determine type (feat, fix, docs, etc.)
3. **AI Enhancement** - Uses Pollinations AI to rewrite technical messages into friendly descriptions
4. **Display** - Shows organized changelog with grouping options
5. **Export** - Generates downloadable files in Markdown or text format

##  Commit Categories

The generator recognizes these conventional commit prefixes:

- `feat:` → ✨ Features
- `fix:` → 🐛 Bug Fixes  
- `docs:` → 📚 Documentation
- `style:` → 💎 Styling
- `refactor:` → ♻️ Refactoring
- `test:` → 🧪 Tests
- `chore:` → 🔧 Chores

##  Build & Deploy

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```


*Powered by [Pollinations AI](https://pollinations.ai) 🌸*
