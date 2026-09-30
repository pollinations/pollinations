# Pi in the browser

Runs the real [Pi coding agent](https://github.com/earendil-works/pi) — not a
clone — inside a [Wasmer](https://github.com/wasmerio/wasmer-sdk) WASIX
sandbox in your browser tab. You paste your own Pollinations API key, pick a
model, give Pi a task, and it edits files and runs commands in that sandbox
using your own Pollen.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL, then:

1. **API key** — create one at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys)
   (a `pk_...` App Key or `sk_...` key both work) and paste it in. It stays in
   memory in the tab; it's sent only to `gen.pollinations.ai`.
2. **Model** — the list is fetched live from `gen.pollinations.ai/v1/models`,
   filtered to first-party tool-calling chat models (what Pi needs to drive
   its tools).
3. **WISP proxy URL** — see below, this is required.
4. **Prompt** — describe what Pi should do, then **Run Pi**. Output streams
   in as Pi works; files it created or edited in the sandbox appear below
   once it exits.

## Why a WISP proxy is required

Browsers can't open raw TCP sockets, so a WASIX sandbox in the browser has no
way to reach `gen.pollinations.ai` on its own. Wasmer's SDK solves this with
[WISP](https://github.com/MercuryWorkshop/wisp-protocol), a proxy that
multiplexes TCP over one WebSocket — the same approach
[wasmer.sh](https://wasmer.sh) (Wasmer's own browser demo) uses, and it also
requires visitors to bring their own WISP endpoint.

Easiest option, run one locally:

```bash
npx wasmer run wasmer/wisp-server --net
```

This listens on `ws://127.0.0.1:4000` by default — paste that in. For a
public demo, deploy the same package to
[Wasmer Edge](https://wasmer.io/wasmer/wisp-server) and use its `wss://` URL
instead. Treat any WISP endpoint as a trusted outbound proxy: it can see
connection metadata for everything the sandbox reaches.

## Browser requirements

WASIX execution runs on Web Workers with `SharedArrayBuffer`, which requires
a [cross-origin-isolated](https://developer.chrome.com/blog/enabling-shared-array-buffer/)
page (`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`). `vite.config.ts` sets these for
dev/preview; `public/_headers` sets them for the Cloudflare Pages deploy.

## Current limitations

- **No public WISP proxy is provided.** You must run or deploy your own (see
  above). This is the same tradeoff Wasmer's own browser demo makes.
- **Tools are scoped** to `read,write,edit,bash,grep,find,ls` — enough for
  small edit-and-run tasks, not full Pi (e.g. no sub-agents).
- **State resets per run.** Each "Run Pi" call creates a fresh sandbox; the
  workspace isn't persisted between runs.
- **First run is slow.** `wasmer/pi` bundles Edge.js and several WASIX
  command-line tools, so the first package download is tens of MB.

## Verified end-to-end

Confirmed with a real local WISP relay
(`@mercuryworkshop/wisp-js`) and a real Pollinations API key: the sandbox
downloads `wasmer/pi`, spawns `pi --print`, opens a live WISP connection, and
Pi's own request reaches `https://gen.pollinations.ai/v1/chat/completions` —
observed both as a genuine TCP stream in the WISP relay's logs and as Pi
printing the exact response body from Pollinations. This was checked against
both `npm run dev` and the production `npm run build` output served
statically, so the same flow that ships to the Cloudflare Pages deploy target
in `deploy.json` has been exercised, not just the dev server.

## How the sandbox is configured

Pi reads its provider config from `~/.pi/agent/{models,auth,settings}.json`.
`wasmer/pi` pins `HOME=/home/pi`, but a browser sandbox's bundled `files` may
only live under `/workspace`, so `src/piSandbox.ts` relocates `HOME` to
`/workspace/home/pi` and writes those three files there before spawning Pi.
The schema matches what `packages/polli-cli/src/harnesses/pi.ts` writes for
the desktop Polli CLI harness, pointed at the same `gen.pollinations.ai/v1`
OpenAI-compatible endpoint.
