# pi-web - the real Pi coding agent in your browser

Open the page, connect your Pollinations account, and ask the **real Pi coding
agent** (the `wasmer/pi` WASIX package, pinned to `0.87.1`) to build and edit a
small project. Pi runs inside a browser-hosted Wasmer sandbox - no install, no
server of ours, and **all model requests spend your own Pollen** (BYOP: Bring
Your Own Pollen).

## What you can do

- **Connect** via the Pollinations authorize screen (the key returns in the URL
  fragment and never touches any server log) or paste an `sk_...` key.
- **Pick a model** from the live catalog (filtered to first-party, tool-calling,
  chat-completions models).
- **Run Pi** on a prompt ("create hello.txt with a haiku about pollen"). Tool
  calls and the answer stream into the page as structured JSON events.
- **Follow-up runs** continue the same Pi session, so "now add a title to
  hello.txt" works.
- **Shell box**: run `ls -la` and friends inside the same sandbox.
- **Export** the workspace as a ZIP (internals like `.bridge`/`.pi` excluded).

## How it works (security model)

- The sandbox runs with **network disabled**. Pi cannot reach the internet.
- A small Pi **extension** (`guest/bridge.mjs`, loaded via the official
  `--extension` mechanism) replaces `fetch`: model requests are serialized to
  `/workspace/.bridge/<uuid>.req` files inside the sandbox.
- A dedicated **pump process** streams those envelopes to the page as
  length-prefixed frames - every read on the trusted side is byte-capped
  (4 MiB envelope / 4 MiB body / 32 MiB response, counted incrementally).
- The page (trusted side) performs the real HTTPS request itself:
  - only `https://gen.pollinations.ai` (`/v1/chat/completions`, `/v1/models`)
  - GET/POST only, `redirect: "error"`, 120 s timeout, max 4 concurrent
  - the page sets `Authorization: Bearer <your key>` itself; guest-supplied
    auth headers are stripped
- **Your key never enters the guest.** The guest config holds the literal
  placeholder `"bridge"`; the key lives in `sessionStorage` of this tab only.
- Requests carry a per-run `runId` + per-connect `keyGen` pair; after Stop or
  reconnect, queued or late requests are never executed.
- Heads-up: guest code could in principle ask the bridge for more model calls -
  bounded by the allowlist above, and always on your own key. That is the
  documented trust model of this demo.

## Browser requirements and limitations

- A browser with **cross-origin isolation** support (Chromium recommended).
  The app serves `COOP: same-origin` + `COEP: require-corp` headers
  (`public/_headers`) because the Wasmer SDK needs `SharedArrayBuffer`.
- **First run downloads the Pi runtime** (~35 MB) and compiles it; on a slow
  connection or CPU this can take a minute or two. Subsequent visits are
  faster (HTTP cache).
- The bridge delivers responses **buffered**, not token-by-token: you see the
  answer when the model completes, not while it generates.
- **No interactive TUI** - Pi runs in guided print/JSON mode, one prompt per
  run. The shell box covers ad-hoc commands.
- File reads are text-based; binary files are skipped on export if huge
  (64 MiB cap).

## Run locally

```bash
npm ci
npm run build        # -> dist/
npm test             # unit tests (node --test)
```

Serve `dist/` with COOP/COEP headers, e.g.:

```bash
npx serve dist       # or any static server that sends public/_headers
```

## End-to-end test

```bash
POLLI_KEY=sk_... npm run e2e
```

Drives headless Chromium through the real flow (connect with a pasted key,
two guided runs with session continuity, shell command, ZIP export, invalid
key handling) and saves a transcript plus screenshots under `test/e2e/out/`.
The BYOP account-connect redirect itself is a manual step (the consent screen
needs an interactive GitHub login); the fragment parsing is covered e2e with
a synthetic fragment.

## Files

| Path | Role |
| --- | --- |
| `src/main.js` | UI wiring |
| `src/auth.js` | BYOP fragment flow, key storage |
| `src/models.js` | live catalog fetch + tool-model filter |
| `src/piConfig.js` | guest Pi config builders (polli-cli schema) |
| `src/sandbox.js` | Wasmer lifecycle, pump transport, runs, export |
| `src/bridgeHost.js` | trusted bridge: framing, allowlist, caps, lifecycle |
| `src/zip.js` | store-only ZIP writer |
| `guest/bridge.mjs` | Pi extension: fetch shim |
| `guest/pump.mjs` | guest process: bounded request stream |
| `test/` | unit tests + `e2e/run-e2e.mjs` |
