// Build: bundles the app + the Wasmer SDK worker for static hosting
// (pollinations.pages-style). Output lands in dist/:
//   bundle.js            - the app (src/main.js + deps)
//   browser-worker.js   - @wasmer/sdk worker
//   pkg/ + wasm          - SDK runtime assets (path-sensitive!)
//   guest/*.mjs          - Pi extension + bridge pump, loaded into the sandbox
//   _headers             - COOP/COEP required by the SDK (SharedArrayBuffer)

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sdkDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "node_modules/@wasmer/sdk",
);

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/guest", { recursive: true });

await build({
    entryPoints: ["src/main.js"],
    bundle: true,
    format: "esm",
    outfile: "dist/bundle.js",
    minify: true,
    sourcemap: true,
    target: ["es2022"],
    conditions: ["browser"],
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".wasm": "file" },
});

await build({
    entryPoints: [`${sdkDir}/dist/browser-worker.js`],
    bundle: true,
    format: "esm",
    outfile: "dist/browser-worker.js",
    target: ["es2022"],
    conditions: ["browser"],
    loader: { ".wasm": "file" },
});

// The SDK resolves its wasm-bindgen glue and .wasm relative to itself via
// new URL(..., import.meta.url); esbuild copies referenced files as assets.
cpSync(`${sdkDir}/pkg`, "dist/pkg", { recursive: true });
// The wasm-bindgen glue is statically bundled into bundle.js, so its
// "wasmer_sdk_js_bg.wasm" ref resolves relative to the bundle: keep a copy
// at the output root next to it.
cpSync(`${sdkDir}/pkg/wasmer_sdk_js_bg.wasm`, "dist/wasmer_sdk_js_bg.wasm");

cpSync("index.html", "dist/index.html");
cpSync("style.css", "dist/style.css");
cpSync(require.resolve("@xterm/xterm/css/xterm.css"), "dist/xterm.css");
cpSync("guest/bridge.mjs", "dist/guest/bridge.mjs");
cpSync("guest/pump.mjs", "dist/guest/pump.mjs");
cpSync("public/_headers", "dist/_headers");

console.log("built dist/");
