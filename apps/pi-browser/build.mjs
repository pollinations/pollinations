// Copies the static app and the Wasmer SDK into dist/. The SDK loads its
// worker and .wasm through relative URLs, so it is served unbundled.
import { cp, rm } from "node:fs/promises";

const from = (path) => new URL(path, import.meta.url);
const files = {
    "index.html": "dist/index.html",
    "style.css": "dist/style.css",
    "_headers": "dist/_headers",
    "src/": "dist/src/",
    "guest/": "dist/guest/",
    "node_modules/@wasmer/sdk/dist/": "dist/vendor/wasmer/dist/",
    "node_modules/@wasmer/sdk/pkg/": "dist/vendor/wasmer/pkg/",
    "node_modules/@wasmer/sdk/LICENSE": "dist/vendor/wasmer/LICENSE",
    "../../packages/ui/src/brand/badge-made-with.svg": "dist/badge.svg",
};

await rm(from("dist/"), { recursive: true, force: true });
for (const [source, target] of Object.entries(files))
    await cp(from(source), from(target), { recursive: true });
console.log("built dist/");
