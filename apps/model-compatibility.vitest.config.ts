import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
        },
    },
    test: {
        setupFiles: ["operations/economics/web/src/setupPublicTests.ts"],
        include: [
            "shared/providers.test.ts",
            "apps/catgpt/ai.test.js",
            "apps/chat/src/**/*.test.{js,jsx}",
            "operations/economics/web/src/lib/modelReconcile.test.ts",
            "operations/economics/web/src/lib/modelIdentity.test.ts",
            "operations/economics/web/src/lib/providerRegistry.public.test.ts",
        ],
    },
});
