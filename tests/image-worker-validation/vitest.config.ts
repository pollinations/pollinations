import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        testTimeout: 300_000, // 5 min default (video models are slow)
        reporters: ["verbose"],
    },
});
