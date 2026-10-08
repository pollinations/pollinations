// Local static server for dist/ with the cross-origin isolation headers the
// WASIX runtime needs (SharedArrayBuffer). Production uses _headers instead.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./dist/", import.meta.url));
const port = Number(process.env.PORT || 8790);
const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
};

createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    const path = resolve(
        root,
        `.${pathname.endsWith("/") ? `${pathname}index.html` : pathname}`,
    );
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep))
        return res.writeHead(403).end();
    try {
        const body = await readFile(path);
        res.writeHead(200, {
            "Content-Type": types[extname(path)] ?? "application/octet-stream",
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
        }).end(body);
    } catch {
        res.writeHead(404).end("Not found");
    }
}).listen(port, "127.0.0.1", () =>
    console.log(`Pi in the browser: http://localhost:${port}`),
);
