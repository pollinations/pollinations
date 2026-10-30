import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./test/e2e",
    testMatch: "**/*.spec.ts",
    workers: 1,
    use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:3003",
        // Optional: use an installed browser locally without downloading Chromium.
        channel: process.env.PLAYWRIGHT_CHANNEL,
    },
    webServer: {
        command:
            "vite --config frontend/vite.config.ts --host 127.0.0.1 --port 3003 --strictPort",
        url: "http://127.0.0.1:3003",
        reuseExistingServer: false,
    },
});
