import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { ART_SET, HERO_IMAGE_SIZES } from "./src/art-config";

// Brand SVGs resolve from source rather than dist, matching enter's frontend
// so the two sites can't drift on the wordmark.
const uiBrand = fileURLToPath(
    new URL("../packages/ui/src/brand", import.meta.url),
);

// Resolve the website's public UI entry points to their original modules.
// This preserves route-level splitting and avoids duplicate primitives across
// the package's independently bundled entries. CSS remains the shared build.
const uiSources = {
    "@pollinations/ui": "index.ts",
    "@pollinations/ui/app-user-menu/sdk": "modules/app-user-menu/sdk.ts",
    "@pollinations/ui/gen": "modules/gen/index.ts",
    "@pollinations/ui/markdown": "markdown.ts",
    "@pollinations/ui/wallet": "modules/wallet/index.ts",
};

export default defineConfig({
    test: {
        server: {
            deps: {
                // Apply React deduplication to the linked UI's hook-based primitives.
                inline: [/@ark-ui\/react/, /@zag-js\/react/],
            },
        },
    },
    plugins: [
        {
            name: "hero-preload-config",
            transformIndexHtml: {
                order: "pre",
                handler: (html) =>
                    html
                        .replace(/__ART_SET__/g, ART_SET)
                        .replace(/__HERO_IMAGE_SIZES__/g, HERO_IMAGE_SIZES),
            },
        },
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
        alias: [
            ...Object.entries(uiSources).map(([name, source]) => ({
                find: new RegExp(`^${name}$`),
                replacement: fileURLToPath(
                    new URL(`../packages/ui/src/${source}`, import.meta.url),
                ),
            })),
            { find: "@pollinations/ui/brand", replacement: uiBrand },
        ],
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
