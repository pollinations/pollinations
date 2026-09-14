# ⚡ Infinite Craft

An AI-powered element crafting game inspired by [Infinite Craft](https://neal.fun/infinite-craft/). Combine elements to discover new ones — the AI generates names, descriptions, and images for each creation.

## 🎮 How to Play

1. **Drag** elements from the sidebar or results into the combine slots
2. **Watch** as the AI generates a brand new element
3. **Discover** first-ever combinations (marked with FIRST badge)
4. **Collect** all elements — there's no limit!

## 🔧 Tech Stack

- **Vanilla HTML/CSS/JS** — zero dependencies, zero build step
- **Pollinations Text API** — generates element names, descriptions, and rarity
- **Pollinations Image API** — illustrates each element with AI art
- **localStorage** — persists your discoveries across sessions

## 🌐 API Endpoints Used

- `POST https://gen.pollinations.ai/v1/chat/completions` — element generation
- `GET https://gen.pollinations.ai/image/{prompt}` — element illustration

## 🚀 Deploy

Just open `index.html` in a browser. No server needed!

## 📝 License

MIT
