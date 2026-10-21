import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
// @ts-expect-error
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

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
    test: {
        include: ["test/**/*.test.ts"],
        restoreMocks: true,
        // vi.resetModules() must also reset the SDK's per-isolate /supported memo
        server: { deps: { inline: ["@weftlabs/sdk"] } },
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
