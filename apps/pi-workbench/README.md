# Pi Workbench

Real [Pi](https://github.com/earendil-works/pi) in a browser, using `wasmer/pi@=0.87.1` and Wasmer SDK 0.19.0. Built by MetaMysteries8 with Codex AI assistance for [quest #15923](https://github.com/pollinations/pollinations/issues/15923).

[Live demo](https://pi-workbench-metamysteries8.endoxidev.chatgpt.site/)

## Run

```sh
npm install --workspaces=false
npm run build
npm run dev
```

Open `http://127.0.0.1:8768`. Start the sandbox, connect your existing Pollinations `sk_` key with usage/balance permission, choose a live tool-capable model, and ask Pi to build. Inspect/edit files and run commands in the browser shell. Download the project ZIP before leaving; files and Pi conversation are held in the sandbox for this page's lifetime.

For wallet authorization, register a publishable App Key with your exact deployment and local callback URLs, then set `public/config.json` to `{ "clientId": "YOUR_PUBLIC_APP_CLIENT_ID" }`. The app uses authorization-code PKCE, requests only usage access, and defaults the consent to 1 Pollen / 1 day. It does not request key-management access. Existing-key connection needs no registered application. Generation keys remain in tab memory; only the non-secret pending PKCE state uses sessionStorage.

Deploy the `dist/` directory to a HTTPS static host. The bundled MIT `coi-serviceworker` provides isolation if the host does not set COOP/COEP headers; first visits can reload once. Hosts may instead use `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Keep all copied Wasmer assets at their relative paths. Their original SDK license is retained in `dist/vendor/wasmer/LICENSE`.

## Runtime and boundaries

The actual upstream Pi CLI and agent loop execute in Wasmer's browser WASIX sandbox. A supported Pi provider extension delegates HTTPS to the upstream Pi OpenAI-completions implementation with a custom fetch. Request/response files bridge the guest to browser fetch: no remote Pi process, rewritten agent loop, or WISP service. Pi's built-in read/write/edit/Bash execute locally. The real account key never enters the guest, its environment, project export, or Pi session. The host permits Pollinations model calls and explicitly enabled MCP tool calls, and requires provider terminal usage. Guided runs use the selected model. The real terminal supports Pi’s model picker and configuration; the app adds no token or context cap and leaves Pi retries and compaction at their configured defaults.

Optional Exa search/page reading and Computer MCP are off by default. Exa returns source URLs for factual work. Computer's paid `bash` operates the account's separate persistent cloud workspace (`/workspace/pi-workbench`), not the browser project or the visitor's computer. No MCP publishing or account-management tool is allowed. Prices are available at `https://gen.pollinations.ai/mcp`.

In guided mode, the stop budget uses balance changes between requests and the API-call limit counts both model and MCP requests. It is not an atomic spending guarantee: an in-flight call and other activity using the same key can exceed the stop budget. Use a key with a server-enforced budget for a strict limit. The **real Pi terminal is uncapped by this app**: its API requests bypass these guided limits and follow Pi’s configured model/settings. Key permissions and server-enforced budgets still apply. Open it to use the upstream interactive CLI, `/model`, `/thinking`, `/settings`, prompts and `!` shell commands; `/quit` returns to the guided view. Local commands work without an API key.

## Browser limitations

- First load can exceed 100 MB; package caching helps subsequent starts. A current browser with WebAssembly threads, SharedArrayBuffer, service workers and sufficient memory is required.
- HTTPS responses are buffered per call before Pi processes SSE. Tools and results appear as Pi emits them; token delivery is not live streaming.
- Guest network access is disabled. Bundled Node, Bash and core utilities work; network-dependent npm installs do not. The optional remote Computer MCP has a different toolset and does not run Node or Python.
- Files and ZIP downloads stay enabled during both agent modes and shell commands. Individual downloads preserve original bytes; ZIP export/import supports binary and large files without an app size cap (available browser memory still matters). User hidden files are included; only the `.pi` and `.bridge` runtime folders are excluded. Existing text JSON projects remain importable. Binary files are read-only in the text editor. Standalone HTML previews use an opaque sandboxed iframe with external network access blocked.
- Reset discards the current sandbox. Stop exports the visible project and closes the whole sandbox to stop descendants; WASIX is not a Unix process-group implementation.
- Public Pollinations agent-publishing permission is unnecessary: Pi calls the user's chosen model directly.

## Evidence and checks

`public/e2e-evidence.json` records a real Nano coding run, an optional-MCP run and a public-demo run: response IDs, provider usage, observed wallet deltas, tool arguments/results, and resulting files. The coding run creates files, executes a test, edits behavior, updates the test expectation, and executes the passing test again. The MCP run uses real Exa search and a read-only remote `printf`, then writes their results locally. A free fixture was used first to establish the real Pi read/write/edit/Bash loop; it is not the paid evidence.

Run `npm test` for the bridge's credential/endpoint boundary, enabled-tool checks, path validation and SSE/MCP response contracts. Reproduce the live run from the app and use **Show run evidence** to inspect or download its receipts. Test fixtures and credentials are not shared with visitors.

The native terminal was also exercised without paid calls: real `!node --version`, a 3 MiB binary-file creation, native `/model`, and clean `/quit`. Individual-file and ZIP downloads remained available while Pi ran and were byte-for-byte verified locally.
