import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    test: {
        include: [
            "apps/catgpt/ai.test.js",
            "apps/chat/src/**/*.test.{js,jsx}",
            "apps/playground/src/model-selection.test.ts",
            "operations/economics/web/src/lib/modelReconcile.test.ts",
            "operations/economics/web/src/lib/modelIdentity.test.ts",
            "operations/economics/web/src/lib/providerRegistry.test.ts",
        ],
    },
});
