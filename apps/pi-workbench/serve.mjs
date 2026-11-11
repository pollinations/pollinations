import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./dist/", import.meta.url));
const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".wasm": "application/wasm",
};
createServer(async (req, res) => {
    const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
    );
    const path = resolve(
        root,
        `.${pathname === "/" ? "/index.html" : pathname}`,
    );
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) {
        res.writeHead(403).end();
        return;
    }
    try {
        const body = await readFile(path);
        res.writeHead(200, {
            "Content-Type": types[extname(path)] || "application/octet-stream",
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
            "Cache-Control": "no-store",
        }).end(body);
    } catch {
        res.writeHead(404).end("Not found");
    }
}).listen(8768, "127.0.0.1", () =>
    console.log("Pi Workbench: http://127.0.0.1:8768"),
);
