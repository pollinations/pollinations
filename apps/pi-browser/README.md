# Pi in the browser

Run the **real [Pi](https://github.com/earendil-works/pi) coding agent** in your
browser, talking to Pollinations models on `gen.pollinations.ai`, paid with your
own Pollen key. No backend, no server-held credentials: Pi executes inside a
Wasmer WASIX sandbox in a Web Worker, and every model call is bridged through
the page with *your* key — which never enters the sandbox.

```text
┌─ browser page ─────────────────────────────────────────────────────┐
│  xterm.js UI            host pump (src/bridge.js)                 │
│  ┌────────────────┐      pending/*.json ──► fetch(Bearer <key>)    │
│  │ Pi TUI (guest) │ ───► /workspace/.bridge ──► gen.pollinations.ai│
│  │ WASIX worker   │ ◄── done/*.json       ◄── SSE/JSON response    │
│  └────────────────┘      (guest fetch shim, src/guest-shim.js)     │
└────────────────────────────────────────────────────────────────────┘
```

A browser sandbox cannot open outbound TCP, so the guest never talks to the
network directly. `NODE_OPTIONS=--import=/workspace/bridge.mjs` installs a
`fetch` shim inside the guest that serialises each request into a file under
`/workspace/.bridge/pending/`. The page drains that queue, forwards the request
with the visitor's key, and writes the buffered answer back to
`done/` for the shim to return as a `Response`.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

1. Open the page in **Chrome or Edge** (see browser support below).
2. Paste a Pollen key from <https://enter.pollinations.ai/keys> — model calls
   need it; the gateway rejects keyless chat.
3. Pick a model, type a task, press **Run**. Pi boots in the sandbox and
   executes the task for real (writes files, runs commands in `bash`).

Everything else — model list, key, bridge log, workspace files — is visible on
the page: the model picker only offers what Pi can actually drive (first-party
text models with tool calling, the same filter `polli-cli` uses), the log shows
every request that left the sandbox with its HTTP status, and the files panel
reads `/workspace` live.

## Configuration

`src/session.js` writes the same three config files Pi expects on a desktop,
using the schema from `packages/polli-cli/src/harnesses/pi.ts`:

- `/workspace/.pi/agent/models.json` — `pollinations` provider pointing at
  `https://gen.pollinations.ai/v1`, `openai-completions` API, Pi's compat
  flags, and the picked model list.
- `/workspace/.pi/agent/auth.json` — only a **placeholder** key; the host pump
  swaps in the real one on the way out, so no credential ever exists in the
  guest.
- `/workspace/.pi/agent/settings.json` — default provider and model; `--model`
  overrides it at launch.

## End-to-end run

`npm run e2e` (with the dev server running and `POLLEN_KEY` set) drives the app
in headless system Chrome: boots Pi, types a prompt into the real terminal, and
waits until a model call has left the sandbox and Pi has created `hello.txt`.
It writes [`evidence/e2e-run.md`](evidence/e2e-run.md) — terminal transcript,
bridged request log, and workspace listing.

```bash
POLLEN_KEY=sk_... npm run e2e
```

## Tests

```bash
npm test             # unit tests: bridge pump, header/key handling, catalog filter
npm run build        # production bundle (vite build)
```

## Browser support

The Wasmer runtime needs **Wasm exception handling** (Chrome/Edge ≥ 139,
Firefox ≥ 133). Older browsers — including the Electron builds embedded in
some editors — fail with `invalid value type 'exnref'`. The page must also be
**cross-origin isolated** for `SharedArrayBuffer`; `vite.config.js` sends the
required `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` headers. When hosting somewhere
other than the Vite dev/preview server, send the same headers (e.g. in your
`_headers` / worker config).

## Limitations

- **Buffered responses.** The bridge returns each response as one buffered
  body, so tokens do not stream into the terminal while the model is still
  generating; Pi renders the reply when the call completes.
- **Only JS `fetch` is bridged.** `bash` commands that need the internet
  (`curl`, `git clone`, …) have no route out of the sandbox. Reading, writing
  and executing local files work normally.
- **A key is required.** The gateway's keyless tier answers model calls with
  401, so the demo needs a Pollen key; without one you can still boot Pi and
  explore the terminal.
- **Pi's own telemetry stops at the door.** Calls to `pi.dev` (install report,
  latest-version check) are answered locally inside the guest — they are not
  part of the model path and the sandbox has no other route out.
- **One Pi at a time.** The sandbox worker is fragile when extra long-lived
  guest processes are spawned alongside Pi, so the app runs a single Pi
  process per session.

## Layout

```text
index.html            UI shell (dark, tensor.art-style)
src/main.js           glue: run/stop, terminal, file list, bridge log
src/session.js        sandbox creation + Pi config + terminal wiring
src/guest-shim.js     guest-side fetch bridge (injected via NODE_OPTIONS)
src/bridge.js         host-side queue pump + key injection
src/catalog.js        live model picker (same filter as polli-cli)
src/auth.js           optional BYOP login (PKCE) — not required for demo
scripts/e2e.mjs       end-to-end run producing evidence/e2e-run.md
scripts/diag.mjs      quick boot+prompt diagnostic, dumps terminal/bridge state
test/                 unit tests (npm test)
```
