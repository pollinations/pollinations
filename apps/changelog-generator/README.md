# Pollinations Changelog Generator

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/pollinations/pollinations/tree/main/apps/changelog-generator)
[![Open in Bolt](https://img.shields.io/badge/Open%20in-Bolt.new-black?style=flat-square&logo=stackblitz)](https://bolt.new/?prompt=Clone%20the%20Changelog%20Generator%20from%20https%3A%2F%2Fgithub.com%2Fpollinations%2Fpollinations%2Ftree%2Fmain%2Fapps%2Fchangelog-generator%20and%20set%20it%20up.%20React%20%2B%20Vite%20app%20using%20Pollinations%20API%20at%20gen.pollinations.ai.)
[![Open in CodeSandbox](https://img.shields.io/badge/Open%20in-CodeSandbox-blue?style=flat-square&logo=codesandbox)](https://codesandbox.io/s/github/pollinations/pollinations/tree/main/apps/changelog-generator)

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
