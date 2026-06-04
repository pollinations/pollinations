# 🐱 CatGPT

Ask a question, get a sarcastic cat comic. CatGPT pairs a withering one-liner
from an aloof cat with a hand-drawn comic panel, in the spirit of the original
[CatGPT comic](https://www.instagram.com/p/Cn4OLhPyDLP/) by
[Tanika Godbole](https://www.instagram.com/missfitcomics/) (@missfitcomics).

Live at [catgpt.pollinations.ai](https://catgpt.pollinations.ai).

## How it works

1. Sign in with your Pollinations account (top-right menu) — generation uses
   your [enter.pollinations.ai](https://enter.pollinations.ai) API key.
2. Type a question. Optionally upload a selfie to be sketched into the panel.
3. CatGPT writes a short reply and renders it as a comic.
4. Download the result, or copy a share link — shared links restore the exact
   meme. Recent generations are kept locally in your browser.

## Tech stack

- **React 19 + Vite + Tailwind v4** single-page app.
- **[@pollinations/sdk](../../packages/sdk)** — `chat` for the reply
  (`claude-fast`) and `image` for the comic (`nanobanana`, falling back to
  `gptimage`).
- **[@pollinations/ui](../../packages/ui)** — shared design primitives and the
  `AppUserMenu` auth/wallet menu.

## Development

```bash
npm install
npm run dev        # http://127.0.0.1:4181
npm run build      # production build to dist/
npm run typecheck
```

This app consumes the local `@pollinations/sdk` and `@pollinations/ui`
workspace packages via `file:` links; `dev`, `build`, and `typecheck` build
those first (`build:deps`).

## Credits

- Original CatGPT comic — [Tanika Godbole](https://www.instagram.com/missfitcomics/)
  (@missfitcomics).
- Idea — Dr. Julia Degen.
- AI generation — [pollinations.ai](https://pollinations.ai).

The CatGPT character and concept are the intellectual property of Tanika
Godbole; AI variations are created with permission and revenue sharing.
