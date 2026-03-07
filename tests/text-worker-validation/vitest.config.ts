import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        testTimeout: 300_000,
        reporters: ["verbose"],
    },
});
