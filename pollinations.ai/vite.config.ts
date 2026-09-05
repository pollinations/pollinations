import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
        cloudflare(),
    ],
    resolve: {
        alias: {
            "@pollinations/ui/brand": uiBrand,
        },
        // Linked UI packages must share the app's SDK auth context.
        dedupe: ["react", "react-dom", "@pollinations/sdk"],
    },
    build: {
        reportCompressedSize: true,
        rollupOptions: {
            output: {
                // Markdown needs no manual chunk: it is reachable only from
                // the legal routes, which autoCodeSplitting already splits.
                // A function keeps the worker build from emitting an empty
                // vendor chunk and catches react-dom/client, which the
                // package-name form missed.
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
});
