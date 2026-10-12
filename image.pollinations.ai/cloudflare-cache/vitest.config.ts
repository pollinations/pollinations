import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
// @ts-expect-error
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

// wrangler.toml's Data rule for *.webp, for the tests: the pool cannot load a
// Data module from outside this folder (shared/assets/weft-paywall.webp). The
// module id has no ".webp" in it, or the pool hands it to that rule anyway.
const AS_ARRAY_BUFFER = "-webp-as-array-buffer.js";
const webpAsArrayBuffer = {
    name: "webp-as-array-buffer",
    enforce: "pre" as const,
    async resolveId(source: string, importer: string) {
        if (!source.endsWith(".webp")) return;
        const resolved = await this.resolve(source, importer, {
            skipSelf: true,
        });
        return resolved.id.replace(/\.webp$/, AS_ARRAY_BUFFER);
    },
    load(id: string) {
        if (!id.endsWith(AS_ARRAY_BUFFER)) return;
        const file = id.replace(AS_ARRAY_BUFFER, ".webp");
        const base64 = readFileSync(file).toString("base64");
        return `export default Uint8Array.from(atob("${base64}"), (c) => c.charCodeAt(0)).buffer;`;
    },
};

// What DreamShaper on gen returns: a 512x512 JPEG, or 1024x1024 for "gen:1024"
const JPEG_512 = readFileSync(
    new URL("test/fixtures/gen-512.jpg", import.meta.url),
);
const JPEG_1024 = readFileSync(
    new URL("test/fixtures/gen-1024.jpg", import.meta.url),
);

/**
 * Fixed gen responses for GET /image/{prompt}, picked by the prompt:
 * "gen:<status>" answers that error, "gen:html" a page instead of an image,
 * "gen:empty" an empty body, "gen:slow" waits 300 ms.
 */
async function gen(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "https://gen.pollinations.ai");
    const prompt = decodeURIComponent(url.pathname.replace(/^\/image\//, ""));
    const status = prompt.match(/^gen:(\d{3})$/)?.[1];

    if (status) {
        res.writeHead(Number(status), { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: `gen answered ${status}` }));
    }
    if (prompt === "gen:html") {
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end("<html>not an image</html>");
    }
    if (prompt === "gen:empty") {
        res.writeHead(200, { "Content-Type": "image/jpeg" });
        return res.end();
    }
    if (prompt === "gen:slow") await new Promise((r) => setTimeout(r, 300));
    res.writeHead(200, { "Content-Type": "image/jpeg" });
    res.end(prompt === "gen:1024" ? JPEG_1024 : JPEG_512);
}

// Tests run in workerd with the [env.test] bindings from wrangler.toml
export default defineWorkersConfig({
    plugins: [webpAsArrayBuffer],
    test: {
        include: ["test/**/*.test.ts"],
        restoreMocks: true,
        poolOptions: {
            workers: {
                wrangler: {
                    configPath: "./wrangler.toml",
                    environment: "test",
                },
                miniflare: {
                    bindings: {
                        GEN_API_KEY: "test-gen-key",
                        WEFT_SELLER_API_KEY: "test-seller-key",
                    },
                    serviceBindings: { GEN: { node: gen } },
                },
            },
        },
    },
});
