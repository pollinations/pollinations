// Copies the @wasmer/sdk browser runtime into public/vendor/wasmer-sdk so the
// app can load it with a native dynamic import (no bundler mangling of the
// SDK's worker/wasm URL resolution).
//
// Runs on plain Node (no Bun-specific APIs) via the esbuild devDependency, and
// is wired as the package "postinstall" script so a fresh clone only needs:
//   npm install && npm run dev
//
// Fixes applied while copying:
//  1. The original dist/ + pkg/ sibling layout is preserved — dist/index.js
//     resolves its wasm-bindgen glue with "../pkg/wasmer_sdk_js.js" and its
//     worker with "./browser-worker.js" relative to import.meta.url.
//  2. dist/wisp-network.js imports the bare specifier
//     "@mercuryworkshop/wisp-js/client", which only a bundler can resolve.
//     The wisp-js client is therefore pre-bundled (esbuild) into
//     dist/wisp-client.bundle.js and the specifier is rewritten to it.
//  3. Source maps and .d.ts files are dropped.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const browserEntry = require.resolve("@wasmer/sdk/browser");
const sdkRoot = browserEntry.replace(/\/dist\/index\.js$/, "");
const target = join(here, "..", "public", "vendor", "wasmer-sdk");

if (!existsSync(sdkRoot)) {
  console.error(`@wasmer/sdk not found at ${sdkRoot}. Run your package manager install first.`);
  process.exit(1);
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

// dist/*.js (browser entrypoint + worker graph — includes node-compat.js and
// node-network-rpc.js, which ARE part of the browser import graph) and pkg/
// (wasm-bindgen glue, the .wasm binary, and JS snippets).
await cp(`${sdkRoot}/dist`, `${target}/dist`, {
  recursive: true,
  filter: (src) => !src.endsWith(".map") && !src.endsWith(".d.ts"),
});
await cp(`${sdkRoot}/pkg`, `${target}/pkg`, {
  recursive: true,
  filter: (src) => !src.endsWith(".map") && !src.endsWith(".d.ts"),
});

// Bundle the wisp-js browser client to a standalone ESM file. The wrapper
// entry (scripts/vendor/wisp-client-entry.mjs) re-exports the client namespace
// as the named export the SDK's wisp-network.js imports.
const wispClientEntry = join(here, "vendor", "wisp-client-entry.mjs");
await build({
  entryPoints: [wispClientEntry],
  bundle: true,
  format: "esm",
  platform: "browser",
  outfile: join(target, "dist", "wisp-client.bundle.js"),
  logLevel: "warning",
});
if (!existsSync(join(target, "dist", "wisp-client.bundle.js"))) {
  console.error("wisp-client.bundle.js was not written — check the esbuild API call.");
  process.exit(1);
}

// Rewrite the bare specifier in wisp-network.js to the bundled file.
const wispNetworkPath = join(target, "dist", "wisp-network.js");
let wispNetwork = await readFile(wispNetworkPath, "utf8");
const specifier = "@mercuryworkshop/wisp-js/client";
if (!wispNetwork.includes(specifier)) {
  console.error(`Expected "${specifier}" import not found in wisp-network.js — SDK layout may have changed.`);
  process.exit(1);
}
wispNetwork = wispNetwork.split(`"${specifier}"`).join('"./wisp-client.bundle.js"');
await writeFile(wispNetworkPath, wispNetwork);

console.log(`Copied @wasmer/sdk runtime to public/vendor/wasmer-sdk (wisp client bundled)`);
