# Pi in the browser

[![Made with Pollinations](../../packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai)

The real [Pi coding agent](https://github.com/earendil-works/pi) running in a
browser tab. Connect your Pollinations account, pick a model, and Pi edits files
and runs commands in a WebAssembly sandbox while you pay with your own Pollen.

There is no server: Pi, its bash, Node and coreutils come from the published
[`wasmer/pi`](https://wasmer.io/wasmer/pi) package and run through the
[Wasmer browser SDK](https://github.com/wasmerio/wasmer-sdk).

## Run it

```sh
cd apps/pi-browser
npm install
npm start   # builds dist/ and serves http://localhost:8790
```

Press **Connect Pollinations** and approve the code in the tab that opens, or
paste an existing `sk_` key. Then ask Pi to build something. The file list, a
file viewer and a bash prompt work on the same project folder. Pi keeps one
conversation per tab; **New conversation** starts a fresh one.

`npm test` runs the unit tests and an offline end-to-end test: the real Pi
package runs through the Node SDK and the same bridge, talking to a scripted
local model, so it costs no Pollen. The first run downloads Pi (about 40 MB).

## How it works

```
page (src/main.js)                      WASIX sandbox, network disabled
  ├─ your key, kept in memory           ├─ pi --mode json --print …
  ├─ src/sandbox.js: mailbox relay  ◄──►├─ guest/pollinations.mjs (Pi extension)
  └─ fetch → gen.pollinations.ai        └─ /workspace/project (your files)
```

- `guest/pollinations.mjs` registers a `pollinations` provider and hands
  requests to Pi's own OpenAI Chat Completions implementation, the approach
  Pi's custom-provider docs recommend. Message conversion, tool calls, retries
  and usage accounting are Pi's code. Only `fetch` is swapped out.
- That `fetch` writes each request into `/workspace/.pi/bridge`. The page
  allows exactly one request, `POST https://gen.pollinations.ai/v1/chat/completions`,
  adds your key, and writes the response stream back chunk by chunk. Pi
  therefore parses the live SSE stream, and the key never enters the sandbox.
- The model list comes from `/v1/models` with the polli CLI's Pi filter, and
  catalog prices are passed on so Pi can report each run's cost in Pollen.
- **Connect Pollinations** uses the
  [device flow](../../BRING_YOUR_OWN_POLLEN.md#️-clis--headless-apps-device-flow).
  The tab running Pi never navigates away, so the sandbox and your files
  survive authorization, and no App Key or redirect URI is needed to host it.

## Browser limitations

- The page must be cross-origin isolated for `SharedArrayBuffer`. `_headers`
  sets COOP/COEP on Cloudflare Pages and `serve.mjs` sets them locally.
- The first visit downloads about 40 MB. Starting Pi takes a few seconds once
  cached.
- The sandbox has no network, so `npm install`, `curl` and git remotes fail.
  Bundled Node, bash and coreutils work.
- Files live in memory and disappear when the tab is closed.
- Pi runs once per prompt in `--print` JSON mode, not as the interactive TUI.
  **Stop** kills the process.
- Responses arrive a chunk at a time through the sandbox filesystem, so text
  streams in bursts rather than token by token.
