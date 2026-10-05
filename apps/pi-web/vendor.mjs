// The Wasmer SDK loads its own worker and .wasm module through relative URLs,
// so it has to be served as-is instead of bundled. Copy it into ./vendor and
// let the import map in index.html point at it. No build step, no bundler.
import { cp, mkdir, rm } from "node:fs/promises";

const TARGET = "vendor/@wasmer/sdk";

await rm("vendor", { recursive: true, force: true });
await mkdir(TARGET, { recursive: true });
await cp("node_modules/@wasmer/sdk/dist", `${TARGET}/dist`, { recursive: true });
await cp("node_modules/@wasmer/sdk/pkg", `${TARGET}/pkg`, { recursive: true });
console.log(`vendored @wasmer/sdk -> ${TARGET}`);
