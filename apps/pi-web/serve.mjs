// Minimal static server for local development and tests.
// Cross-origin isolation headers are mandatory: the worker-backed WASIX
// runtime needs SharedArrayBuffer, which browsers only expose to
// cross-origin-isolated pages.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("./", import.meta.url));
const PORT = Number(process.env.PORT || 8789);
const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".wasm": "application/wasm",
    ".svg": "image/svg+xml",
    ".map": "application/json; charset=utf-8",
};

export function createStaticServer({ root = ROOT } = {}) {
    return createServer(async (req, res) => {
        try {
            const url = new URL(req.url, "http://localhost");
            let path = normalize(decodeURIComponent(url.pathname));
            if (path.endsWith("/")) path += "index.html";
            const file = join(root, path);
            if (!file.startsWith(root)) throw new Error("path escape");
            const body = await readFile(file);
            res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
            res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            res.setHeader("Cache-Control", "no-store");
            res.setHeader(
                "Content-Type",
                TYPES[extname(file)] || "application/octet-stream",
            );
            res.end(body);
        } catch {
            res.statusCode = 404;
            res.end("not found");
        }
    });
}

if (import.meta.url === `file://${process.argv[1]}`) {
    createStaticServer().listen(PORT, () => {
        console.log(`pi-web dev server: http://localhost:${PORT}`);
    });
}
