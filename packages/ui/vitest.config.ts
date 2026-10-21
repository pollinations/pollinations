import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@pollinations/sdk/react": fileURLToPath(
                new URL("../sdk/src/react/index.ts", import.meta.url),
            ),
        },
    },
    test: {
        include: ["src/**/*.test.{ts,tsx}"],
    },
});
