# pi-in-browser

Run the real [Pi coding agent](https://github.com/badlogic/pi-mono) fully in
the browser, powered by your own Pollinations account (BYO Pollen).

Pi runs inside a Wasmer/EdgeJS sandbox compiled to WebAssembly
([wasmer/pi](https://wasmer.io/pi)); all model traffic is bridged through
your browser to `gen.pollinations.ai` with *your* API key. The key never
leaves your browser session and is never written into the sandbox.

## How it works

```
┌─────────────── your browser ────────────────┐
│  UI (xterm.js)                               │
│  Wasmer host  ←── stdio frames ──►  pump     │
│      │            .bridge/ files             │
│      ▼                                      │
│  bridge host: fetch with YOUR key            │
└──────────────────┬───────────────────────────┘
                   │ HTTPS + SSE
                   ▼
        gen.pollinations.ai/v1/chat/completions
                   ▲
                   │ fetch override (guest side)
┌───────────────────┴─────────────────────────┐
│  sandbox: Pi + node + bash + your files      │
└──────────────────────────────────────────────┘
```

1. The Pi webc package is loaded into a Wasmer sandbox
   (`node` and `bash` are available to the agent inside).
2. A tiny guest extension patches `globalThis.fetch`. Instead of talking to
   the network (the sandbox has no outbound net access), each request is
   written as an envelope to a `.bridge/` directory in the sandbox.
3. A pump process in the sandbox tails those files, re-emits the requests as
   length-prefixed frames on stdout, and streams response chunks back from
   stdin.
4. The browser-side bridge host decodes the frames, validates them
   (only `POST /v1/chat/completions` on `gen.pollinations.ai` is allowed),
   injects the real API key, and streams the upstream SSE response back to
   the guest. Tokens appear live as Pi works.

Why a file queue instead of raw stdio? The Wasmer SDK's stream framing is
not request-scoped; the file-based protocol gives each request a
correlation id, survives chunk boundaries, and makes the whole pipeline
testable end to end without a browser.

## Security properties

* **Key isolation:** the guest never sees the real API key. Pi's config
  only contains a dummy key (`bridge`); the real key is injected by the
  host at fetch time and cannot be extracted from the sandbox.
* **Fail-closed forwarding:** the bridge forwards only chat completions to
  `gen.pollinations.ai`. Any other URL, method, or malformed envelope is
  rejected with `403`/`413` before a socket is opened.
* **Size caps:** request bodies are capped at 4 MB, frames at 5 MB, and the
  pump drops oversize requests instead of buffering them.

## Run it

```bash
npm install
npm run build     # bundles the SDK worker and guest sources
npm test          # unit tests (node:test, no network)
```

Open `dist/index.html`, paste an API key from
https://enter.pollinations.ai/keys, pick a model, and type a task.
Pi runs inside the sandbox, edits files, and streams responses live.

Optional: set `POLLINATIONS_API_KEY` and place a Pi webc at
`/tmp/pi-1.0.0.webc`, then `node test/e2e.mjs` runs the full pipeline in
Node: sandbox boot, bridge, and (if the key has streaming permission) a
guided Pi run that creates a file. Restricted seed keys run the bridge
transport phase only.

## Layout

```
src/            browser host (Wasmer host, bridge, UI)
guest/          files copied INTO the sandbox (extension, pump)
test/           node:test unit tests + e2e harness
build.mjs       esbuild bundler (SDK worker asset included)
```

## Notes

* Pi version and webc mirrors are pinned in `src/piConfig.js`
  (`wasmer/pi@1.0.0`).
* The model list is pulled from `/v1/models` and filtered to tool-calling
  text models on `/v1/chat/completions`.
* The workspace can be exported as a zip (dependency-free writer in
  `src/zip.js`) when a run finishes.
