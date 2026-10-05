# Pi in the browser

Run the **real [Pi coding agent](https://github.com/earendil-works/pi)** in a
browser tab, on your own Pollen, with no server in the loop.

Pi runs inside a WebAssembly sandbox (`@wasmer/sdk` + the published
`wasmer/pi` package). The sandbox has **networking disabled**, so Pi cannot
reach the internet on its own — every model call is handed to the page, which
adds your Pollinations key and talks to `gen.pollinations.ai`. The key never
enters the sandbox.

## Run it

```sh
cd apps/pi-web
npm install
npm run vendor   # copies @wasmer/sdk into ./vendor (no bundler involved)
npm start        # http://localhost:8789
```

Open the page, paste a Pollinations key, press **Connect**, then ask Pi for
something. The first boot downloads roughly 35 MB of runtime; later visits
reuse the browser cache.

### Getting a key

Any Pollinations key works. To hand a visitor their own key you can use
[Bring Your Own Pollen](../../BRING_YOUR_OWN_POLLEN.md): send them through
`https://enter.pollinations.ai/authorize` and the key comes back in the URL
fragment (`#api_key=sk_…`). The page reads that fragment on load and clears it
from the address bar, so the key is never sent to a server.

## What works

- Pi's real agent loop: file reads, writes, edits, and running commands with
  `bash`
- The visitor's own key and model selection
- A file list for `/workspace` with click-to-preview

## Browser limitations

- **Cross-origin isolation is mandatory.** The WASIX runtime needs
  `SharedArrayBuffer`, so the page must be served with
  `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp`. `serve.mjs` sets these
  locally and `public/_headers` carries them for static hosts.
- **First load is heavy** (~35 MB). The runtime is cached by the browser
  afterwards, but there is no smaller build yet.
- **No interactive TUI.** Pi runs in `--mode json` with `-p`, so this is a
  one-prompt-at-a-time example rather than a terminal. The JSON event stream is
  shown in the log panel.
- **Non-interactive tools only.** Anything that expects a TTY or a real
  terminal prompt cannot be driven here.
- **Long jobs are bounded.** The bridge waits up to three minutes for one HTTP
  reply, which is enough for a normal completion but not for a very long
  generation.

## A real end-to-end run

[`test/e2e-transcript.md`](./test/e2e-transcript.md) is the captured output of
a headless-Chrome run: Pi created `squares.mjs`, ran it with `node`, and
reported the output.

Reproduce it with:

```sh
POLLINATIONS_KEY=sk_… node test/e2e.mjs
```

Unit tests (`node --test test/*.test.mjs`) cover the Pi configuration builders
and the bridge's host allowlist.

## How it fits together

```
index.html          UI + import map for the vendored SDK
src/main.js         UI orchestration
src/sandbox.js      boots the WASIX sandbox and runs Pi
src/bridge.js       host side of the fetch bridge (allowlist: gen.pollinations.ai)
src/piConfig.js     models.json / auth.json / settings.json builders
guest/bridge.mjs    Pi extension that runs inside the sandbox and replaces fetch
serve.mjs           dev server with the cross-origin isolation headers
test/e2e.mjs        real end-to-end run in headless Chrome
```

The bridge is deliberately dumb: two files and a poll loop. The guest writes
`/workspace/.bridge/<id>.req`, the page answers with `<id>.resp`. That is the
whole protocol, and it keeps the credential on the trusted side of the
sandbox boundary.
