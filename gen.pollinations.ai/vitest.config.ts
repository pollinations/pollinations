import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const genSrc = fileURLToPath(new URL("./src/", import.meta.url));
const sharedSrc = fileURLToPath(new URL("../shared/", import.meta.url));
const cloudflareWorkersStub = fileURLToPath(
    new URL("./test/cloudflare-workers.ts", import.meta.url),
);

const genAliases = [
    "content-filter.ts",
    "cache",
    "durable-objects/PollenRateLimiter.ts",
    "env.ts",
    "error.ts",
    "events.ts",
    "logger",
    "logger.ts",
    "middleware/auth.ts",
    "middleware/balance.ts",
    "middleware/logger.ts",
    "middleware/media-cache.ts",
    "middleware/model.ts",
    "middleware/rate-limit-durable.ts",
    "middleware/rate-limit-edge.ts",
    "middleware/text-cache.ts",
    "middleware/track.ts",
    "middleware/validator.ts",
    "schemas/image.ts",
    "schemas/text.ts",
    "util",
    "util.ts",
    "utils/api-docs.ts",
    "utils/generation-access.ts",
    "utils/media-cache.ts",
    "utils/model-stats.ts",
    "utils/text-cache.ts",
];

export default defineConfig({
    resolve: {
        alias: [
            ...genAliases.map((path) => ({
                find: `@/${path}`,
                replacement: `${genSrc}${path}`,
            })),
            {
                find: /^@shared\/(.*)$/,
                replacement: `${sharedSrc}$1`,
            },
            {
                find: "cloudflare:workers",
                replacement: cloudflareWorkersStub,
            },
        ],
    },
    test: {
        environment: "node",
    },
});
