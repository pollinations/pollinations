import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const genSrc = fileURLToPath(new URL("./src/", import.meta.url));
const enterSrc = fileURLToPath(
    new URL("../enter.pollinations.ai/src/", import.meta.url),
);
const sharedSrc = fileURLToPath(new URL("../shared/", import.meta.url));

const genAliases = [
    "content-filter.ts",
    "env.ts",
    "middleware/media-cache.ts",
    "middleware/model.ts",
    "middleware/rate-limit-edge.ts",
    "middleware/requestDeduplication.ts",
    "middleware/text-cache.ts",
    "middleware/track.ts",
    "middleware/validator.ts",
    "schemas/image.ts",
    "schemas/text.ts",
    "utils/generation-access.ts",
    "utils/media-cache.ts",
    "utils/text-cache.ts",
];

const enterAliases = [
    ["@/auth.ts", "auth.ts"],
    ["@/cache", "cache.ts"],
    ["@/db/schema/better-auth.ts", "db/schema/better-auth.ts"],
    [
        "@/durable-objects/PollenRateLimiter.ts",
        "durable-objects/PollenRateLimiter.ts",
    ],
    ["@/error.ts", "error.ts"],
    ["@/events.ts", "events.ts"],
    ["@/logger", "logger.ts"],
    ["@/middleware/auth.ts", "middleware/auth.ts"],
    ["@/middleware/balance.ts", "middleware/balance.ts"],
    ["@/middleware/logger.ts", "middleware/logger.ts"],
    ["@/middleware/rate-limit-durable.ts", "middleware/rate-limit-durable.ts"],
    ["@/routes/account.ts", "routes/account.ts"],
    ["@/tier-config.ts", "tier-config.ts"],
    ["@/util", "util.ts"],
    ["@/util.ts", "util.ts"],
    ["@/utils/api-docs.ts", "utils/api-docs.ts"],
    ["@/utils/model-stats.ts", "utils/model-stats.ts"],
    ["@/utils/track-helpers.ts", "utils/track-helpers.ts"],
] as const;

export default defineConfig({
    resolve: {
        alias: [
            ...genAliases.map((path) => ({
                find: `@/${path}`,
                replacement: `${genSrc}${path}`,
            })),
            ...enterAliases.map(([find, path]) => ({
                find,
                replacement: `${enterSrc}${path}`,
            })),
            {
                find: /^@shared\/(.*)$/,
                replacement: `${sharedSrc}$1`,
            },
        ],
    },
    test: {
        environment: "node",
    },
});
