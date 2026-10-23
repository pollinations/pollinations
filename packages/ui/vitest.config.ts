import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        // The SDK source below resolves react from packages/sdk/node_modules
        // when that standalone install exists; keep one copy of React.
        dedupe: ["react", "react-dom"],
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
