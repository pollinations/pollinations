import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// @wasmer/sdk runs its WASIX guests on Web Workers with SharedArrayBuffer,
// which browsers only expose to a cross-origin-isolated page.
const isolationHeaders = {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
};

// dist/browser-worker.js and pkg/wasmer_sdk_js.js are only reachable through
// a runtime `new URL(...)`, so Vite copies them as opaque assets without
// following their own relative imports (including the wasm-bindgen inline-JS
// snippets dir). Copy those in too, or the worker fails to load at runtime.
function wasmerWorkerDeps(): Plugin {
    const require = createRequire(import.meta.url);
    const distFiles = [
        "node-compat.js",
        "host-filesystem.js",
        "node-network-rpc.js",
        "capi-worker-bridge.js",
    ];
    let outDir = "dist";
    return {
        name: "wasmer-worker-deps",
        apply: "build",
        configResolved(config) {
            outDir = config.build.outDir;
        },
        closeBundle() {
            const sdkRoot = dirname(
                dirname(require.resolve("@wasmer/sdk/browser")),
            );
            const assetsDir = join(outDir, "assets");
            mkdirSync(assetsDir, { recursive: true });
            for (const file of distFiles) {
                copyFileSync(
                    join(sdkRoot, "dist", file),
                    join(assetsDir, file),
                );
            }
            cpSync(
                join(sdkRoot, "pkg", "snippets"),
                join(assetsDir, "snippets"),
                { recursive: true },
            );
        },
    };
}

export default defineConfig({
    plugins: [react(), wasmerWorkerDeps()],
    base: "./",
    server: { headers: isolationHeaders },
    preview: { headers: isolationHeaders },
    optimizeDeps: { exclude: ["@wasmer/sdk"] },
});
