# 📱 Pollinations Apps

Build cool **frontend-only** apps with Pollinations AI. Pure HTML/CSS/JS or React - no backend needed!

## What Goes Here?

Frontend apps that use Pollinations APIs (text/image generation). Each app gets its own folder.

**Two Types of Apps:**

### 1. **Pure HTML** (simplest)

-   Single `index.html` file with inline CSS/JS
-   No build step, just open in browser
-   Perfect for quick tools and demos

### 2. **React + Vite** (for complex apps)

-   Uses React for UI
-   Vite for dev server and building
-   Still frontend-only, no backend

**Requirements:**

-   ✅ Actually works (no broken features)
-   ✅ Has a README explaining what it does
-   ✅ Uses Pollinations API meaningfully
-   ✅ Frontend-only (no backend/server code)

**Bonus points:**

-   🔥 Auto-deployed preview (GitHub Pages)
-   🎨 Screenshots/GIFs
-   💯 Clean, readable code
-   ✨ Does something unique

## Structure

### Pure HTML App:

```
apps/
├── your-app-name/
│   ├── README.md
│   └── index.html    # everything in one file
```

### React App:

```
apps/
├── your-app-name/
│   ├── README.md
│   ├── package.json
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       └── App.jsx
```

## How to Submit

### Step 1: Propose Your App Idea (Recommended)

Before building, **create a GitHub issue** with your app idea:

1. Go to [Issues](https://github.com/pollinations/pollinations/issues/new) and select "SubmitApp"
2. Fill out the app submission form
3. Wait for feedback from maintainers

**Why propose first?**

-   Get early feedback on your idea
-   Avoid building something that won't be accepted
-   Maintainers can suggest improvements
-   Shows you're serious about contributing

### Step 2: Build Your App

Once your idea is approved (or if you're feeling confident):

1. Fork this repo
2. Create your app folder in `apps/`
3. Build something that actually works
4. Test it from a fresh clone (seriously, do this)
5. PR with title: `Add [App Name]`
6. Link to your original issue in the PR description

## Setup

1. Get a free ImgBB API key from https://api.imgbb.com/
2. Copy `.env.example` to `.env`
3. Add your API key to `.env`

## Templates & Examples

**Templates:**

-   **[TEMPLATE-HTML](./TEMPLATE-HTML/)** - Single-file HTML app (easiest)
-   **[TEMPLATE-REACT](./TEMPLATE-REACT/)** - React + Vite app (for complex UIs)

**Example Apps:**

-   **[CatGPT](./example-catgpt/)** - Pure HTML meme generator 🐱
-   **[Elevator Challenge](./example-elevator-challenge/)** - React + Vite game 🚀

## App Ideas

**Creative:**

-   AI meme generator (like CatGPT!)
-   Character design tool
-   Album cover creator
-   Story illustration generator
-   Tarot card reader

**Productivity:**

-   Thumbnail generator for blogs
-   Social media content creator
-   Placeholder generator

**Fun:**

-   "Guess the AI prompt" game
-   Millionaire quiz game
-   AI chat interface

**Dev Tools:**

-   Graphics editor with AI
-   SVG feedback tool
-   LLM feedback interface

## Resources

-   [API Docs](../APIDOCS.md)
-   [Main README](../README.md)
-   [Contributing Guide](../CONTRIBUTING.md)
-   [Discord](https://discord.gg/8HqSRhJVxn)

## Recognition

Good apps might get:

-   Featured on pollinations.ai
-   Tier upgrades (flower/nectar access)
-   Community recognition

---

**Let's build something fire 🔥**
