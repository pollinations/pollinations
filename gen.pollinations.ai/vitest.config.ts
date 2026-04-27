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

export default defineConfig({
    resolve: {
        alias: [
            ...genAliases.map((path) => ({
                find: `@/${path}`,
                replacement: `${genSrc}${path}`,
            })),
            {
                find: /^@\/(.*)$/,
                replacement: `${enterSrc}$1`,
            },
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
