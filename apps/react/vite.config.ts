import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    // Monorepo has React 18 in apps/react + packages/sdk + packages/ui and
    // React 19 at the workspace root. Without dedupe, the symlinked workspace
    // packages can resolve a different React copy than the app, producing
    // "Invalid hook call" or a split React context.
    resolve: {
        dedupe: ["react", "react-dom"],
    },
});
