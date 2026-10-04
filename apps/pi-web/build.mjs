// Bundles the app into dist/: main bundle, the Wasmer SDK browser worker,
// the SDK's wasm-bindgen glue (dynamically imported by the worker), guest
// sources, index.html and the Pages _headers file (COOP/COEP are required
// for crossOriginIsolated / SharedArrayBuffer).

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { build } from "esbuild";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await build({
    entryPoints: ["src/main.js"],
    bundle: true,
    format: "esm",
    outfile: "dist/bundle.js",
    logLevel: "warning",
});

await build({
    entryPoints: ["node_modules/@wasmer/sdk/dist/browser-worker.js"],
    bundle: true,
    format: "esm",
    outfile: "dist/browser-worker.js",
    logLevel: "warning",
});

cpSync("node_modules/@wasmer/sdk/pkg", "dist/pkg", { recursive: true });
// the main bundle resolves its wasm next to itself (import.meta.url)
cpSync(
    "node_modules/@wasmer/sdk/pkg/wasmer_sdk_js_bg.wasm",
    "dist/wasmer_sdk_js_bg.wasm",
);
cpSync("index.html", "dist/index.html");
cpSync("guest", "dist/guest", { recursive: true });
cpSync("public/_headers", "dist/_headers");

console.log("dist/ ready");
