# Pi in the Browser — powered by Pollinations

The **real [Pi coding agent](https://github.com/earendil-works/pi)** (the actual
`pi` CLI, v0.87.1) running **entirely inside your browser** in a WebAssembly
sandbox — no server, no remote agent. Connect your Pollinations account, choose
a model, and Pi reads, writes, and runs files in a browser-hosted workspace
while spending **your own Pollen** (BYO Pollen).

Built for Pollinations Quest #15923.

```
┌─────────────────────────┬──────────────┐
│  Pi agent chat          │  Live files  │
│  (streamed JSON events) │  (sandbox FS)│
│  tool cards: bash/write │  + viewer    │
└─────────────────────────┴──────────────┘
        │ runs in-page (WASM + Workers)
        ▼
   wasmer/pi@0.87.1  ── HTTPS via your WISP tunnel ──▶  gen.pollinations.ai
```

## How it works

1. **BYO Pollen** — the app uses the [Connect User Wallets / BYOP](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)
   OAuth authorization-code flow (PKCE). The user-authorized `sk_...` key lives
   in memory/`sessionStorage` only and is never sent anywhere except
   Pollinations. The app itself has no backend.
2. **Model picker** — the tool-calling model list is fetched live from
   `GET gen.pollinations.ai/models` (with a small offline fallback). The chosen
   model is written into the sandbox's `models.json` as an
   `openai-completions` provider pointing at `gen.pollinations.ai/v1`, so Pi
   speaks to Pollinations exactly like it would to any OpenAI-compatible
   endpoint. Switching models mid-session just rewrites `models.json`.
3. **The sandbox** — the [Wasmer SDK](https://github.com/wasmerio/wasmer-sdk)
   loads the published `wasmer/pi@=0.87.1` package (Pi + Edge.js + bash,
   coreutils, fd, ripgrep, grep, sed, findutils) into a WASIX sandbox with an
   in-memory filesystem seeded with a small starter project.
4. **The agent loop** — each message runs
   `pi --mode json --offline --provider pollinations --model <id> --tools read,write,edit,bash,grep,find,ls --session-id <id> "<prompt>"`
   inside the sandbox. The app consumes Pi's JSONL event stream and renders
   streaming text, thinking, and live tool cards (bash output, file writes and
   edits). Conversation history persists across messages via Pi sessions, all
   inside the sandbox filesystem.
5. **Network** — browsers cannot open raw TCP sockets, so Pi's HTTPS traffic to
   `gen.pollinations.ai` is tunneled through a [WISP](https://github.com/wasmerio/wasmer-sdk/blob/main/js/README.md)
   server the user controls (one-click deploy to a free Wasmer account, a local
   `wasmer run wasmer/wisp-server --net`, or any `wss://` endpoint).

## Run it

```bash
npm install        # postinstall vendors the Wasmer SDK into public/vendor
npm run dev        # http://localhost:3000
```

Requirements: Node 20+ (or Bun). The dev/prod server **must** send
cross-origin-isolation headers — `next.config.ts` already does:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### Configure the App Key

1. Create a **publishable App Key** at <https://enter.pollinations.ai/keys>
   ("Create New App Key").
2. Add a redirect URI matching your deployment, e.g. `http://localhost:3000/`
   (loopback matches any port) and your production URL.
3. Set it in `.env` / your host's env:

```
NEXT_PUBLIC_POLLINATIONS_APP_KEY=pk_yourkey
```

Without an App Key the OAuth button is disabled, but you can still paste an
existing `sk_...` API key under "Advanced".

Optional overrides:

```
# Point at a different Pollinations-compatible gateway (defaults to https://gen.pollinations.ai)
NEXT_PUBLIC_POLLINATIONS_API_BASE=https://gen.pollinations.ai
```

### Deploying

Any host that can set the two COOP/COEP headers works (Vercel: add the headers
in `next.config.ts` — already included). Note that `NEXT_PUBLIC_*` variables
are baked at build time.

### Testing without a Pollinations account

`mini-services/pi-e2e-fixture` is a local stand-in for the Pollinations API: a
scripted OpenAI-compatible streaming endpoint (bash → write → final answer)
plus a WISP server. It exercises the real Pi agent loop with zero spend:

```bash
bun run e2e:fixture        # prints the API base + WISP URL (default :3901)
# then in .env:
# NEXT_PUBLIC_POLLINATIONS_API_BASE=http://<your-lan-ip>:3901
```

Point the app's WISP field at the printed `ws://<lan-ip>:3901`, paste any
`sk_...`-shaped key, pick "Mock Agent Loop", and launch.

## Current browser limitations

- **Cross-origin isolation required.** The Wasmer runtime needs
  `SharedArrayBuffer`, so the app must be served with COOP/COEP headers. The
  built-in check banner tells you if they are missing.
- **The sandbox is in-memory.** Files, Pi sessions, and the conversation reset
  on reload. Downloaded Wasmer packages *are* cached in browser storage, so
  later launches are fast.
- **Networking via WISP.** The browser cannot open TCP sockets directly; the
  user provides a WISP endpoint (one-click Wasmer deploy, local CLI, or custom
  URL). Latency to `gen.pollinations.ai` depends on that tunnel.
- **No `git`** inside the sandbox (Pi's `bash` tool has coreutils, fd, ripgrep,
  grep, sed, find, Node/npm/pnpm — but not git). This is noted in Pi's system
  prompt.
- **Long-running processes** (dev servers) never exit on their own; the system
  prompt asks Pi to avoid them unless requested.
- **One pi process per message.** Each message spawns a fresh `pi --mode json`
  run that resumes the same Pi session. Startup adds ~1–2 s per message.
- **Model availability.** The picker only shows models that report tool
  support and a healthy status from `gen.pollinations.ai/models`.

## App structure

```
src/
  app/                 Next.js app router (single page; OAuth returns to /)
  components/pi/       Onboarding, workspace view, chat, files, WISP dialog
  lib/
    pollinations.ts    BYO-Pollen OAuth (PKCE), balance, models, models.json
    wisp.ts            WISP endpoint storage + autoconfigure (BroadcastChannel)
    pi-browser.ts      Wasmer SDK loader, sandbox lifecycle, pi runner
    pi-events.ts       pi --mode json JSONL event reducer
scripts/
  copy_wasmer_vendor.mjs       postinstall: vendor the SDK (+ wisp client bundle)
  vendor/wisp-client-entry.mjs esbuild entry for the wisp-js client bundle
mini-services/pi-e2e-fixture/  local mock Pollinations API + WISP for testing
```

## Credits

- [Pi](https://github.com/earendil-works/pi) — the agent harness, by
  earendil-works (runs unmodified as `wasmer/pi@=0.87.1`)
- [Wasmer](https://wasmer.io) & the
  [Wasmer SDK](https://github.com/wasmerio/wasmer-sdk) — WASIX in the browser
- [Pollinations](https://pollinations.ai) — models, Pollen, and the BYO-Pollen
  flow
