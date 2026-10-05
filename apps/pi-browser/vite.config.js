import { defineConfig } from "vite";

// Worker-backed WASIX uses SharedArrayBuffer, so the page must be
// cross-origin isolated: COOP same-origin + COEP require-corp.
const isolationHeaders = {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
    // The SDK resolves its wasm, worker and helper modules with
    // `new URL("…", import.meta.url)`. Pre-bundling rewrites that URL into the
    // deps folder, so the requests come back as index.html instead of wasm.
    // Serving the package raw keeps every path intact.
    optimizeDeps: {
        exclude: ["@wasmer/sdk"],
    },
    server: {
        port: 5173,
        headers: isolationHeaders,
    },
    preview: {
        port: 4173,
        headers: isolationHeaders,
    },
    build: {
        target: "esnext",
    },
});
