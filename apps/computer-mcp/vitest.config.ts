import path from "node:path";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { buildSync } from "esbuild";
import { defineConfig } from "vitest/config";

// The real media RPC service with local R2 storage, so `assets publish`
// is exercised end to end.
const mediaScript = buildSync({
    entryPoints: [
        path.join(__dirname, "../../media.pollinations.ai/src/media-upload.ts"),
    ],
    bundle: true,
    write: false,
    format: "esm",
    external: ["cloudflare:workers"],
    tsconfig: path.join(__dirname, "../../media.pollinations.ai/tsconfig.json"),
    footer: { js: "export default {};" },
}).outputFiles[0].text;

export default defineConfig({
    plugins: [
        cloudflareTest({
            wrangler: { configPath: "./wrangler.test.jsonc" },
            miniflare: {
                workers: [
                    {
                        name: "media-test",
                        modules: true,
                        script: mediaScript,
                        compatibilityDate: "2025-11-12",
                        r2Buckets: ["MEDIA_BUCKET"],
                        bindings: { MAX_FILE_SIZE: "104857600" },
                    },
                ],
                serviceBindings: {
                    MEDIA: { name: "media-test", entrypoint: "MediaUpload" },
                },
            },
        }),
    ],
    test: {
        include: ["src/**/*.test.ts"],
    },
});
