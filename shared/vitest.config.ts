import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    root: fileURLToPath(new URL("../", import.meta.url)),
    resolve: {
        alias: {
            "@shared": fileURLToPath(new URL("./", import.meta.url)),
        },
    },
    test: {
        include: ["shared/providers.test.ts", "shared/agent-json.test.ts"],
    },
});
