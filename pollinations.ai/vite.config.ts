import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Brand SVGs resolve from source rather than dist, matching enter's frontend
// so the two sites can't drift on the wordmark.
const uiBrand = fileURLToPath(
    new URL("../packages/ui/src/brand", import.meta.url),
);

export default defineConfig({
    plugins: [
        // Must run before react() so the generated route tree exists.
        tanstackRouter({
            target: "react",
            autoCodeSplitting: true,
            routesDirectory: "./src/routes",
            generatedRouteTree: "./src/routeTree.gen.ts",
        }),
        react(),
        tailwindcss(),
        tsconfigPaths(),
        cloudflare(),
    ],
    resolve: {
        alias: {
            "@shared": path.resolve(__dirname, "../shared"),
            "@pollinations/ui/brand": uiBrand,
        },
        dedupe: ["react", "react-dom"],
    },
    build: {
        reportCompressedSize: true,
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ["react", "react-dom", "@tanstack/react-router"],
                    markdown: ["react-markdown", "remark-gfm"],
                },
            },
        },
    },
    optimizeDeps: {
        esbuildOptions: {
            loader: {
                ".js": "jsx",
            },
        },
    },
});
