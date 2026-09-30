import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [
        // Must run before react() so the generated route tree exists.
        tanstackRouter({ autoCodeSplitting: true }),
        react(),
        tailwindcss(),
        tsconfigPaths(),
        svgr(),
        cloudflare(),
    ],
    resolve: {
        alias: {
            "@shared": path.resolve(__dirname, "../shared"),
        },
    },
    build: {
        reportCompressedSize: true,
        rollupOptions: {
            output: {
                // Markdown needs no manual chunk: it is reachable only through
                // lazy imports and the legal routes, which autoCodeSplitting
                // already splits. A function keeps the worker build from
                // emitting an empty vendor chunk and catches react-dom/client,
                // which the package-name form missed.
                manualChunks(id) {
                    if (
                        /node_modules\/(react|react-dom|scheduler|@tanstack\/(react-router|router-core|history|store|react-store))\//.test(
                            id,
                        )
                    ) {
                        return "vendor";
                    }
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
