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

/** Fixed gen responses for GET /image/{prompt}, picked by the prompt */
async function gen(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "https://gen.pollinations.ai");
    const prompt = decodeURIComponent(url.pathname.replace(/^\/image\//, ""));
    res.writeHead(200, { "Content-Type": "image/jpeg" });
    res.end(prompt === "gen:1024" ? JPEG_1024 : JPEG_512);
}

export default defineWorkersConfig({
    test: {
        include: ["test/**/*.test.ts"],
        poolOptions: {
            workers: {
                wrangler: {
                    configPath: "./wrangler.toml",
                    environment: "test",
                },
                miniflare: {
                    serviceBindings: { GEN: { node: gen } },
                },
            },
        },
    },
});
