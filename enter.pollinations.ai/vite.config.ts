import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const frontendSrc = fileURLToPath(new URL("./frontend/src", import.meta.url));
const sharedSrc = fileURLToPath(new URL("../shared", import.meta.url));

// The origin that serves THIS deployment's static assets, so social-preview
// image tags (og:image / twitter:image) resolve to the build's own amber card
// instead of always pointing at production. og:url / canonical stay production
// (content identity). `.env` is gitignored here, so this lives in the config.
const publicOrigin = (mode: string) =>
    mode === "staging"
        ? "https://staging.enter.myceli.ai"
        : "https://enter.pollinations.ai";

export default defineConfig(({ mode }) => ({
    root: "frontend",
    server: {
        port: 3000,
        allowedHosts: [".trycloudflare.com"],
    },
    publicDir: "public",
    assetsInclude: ["**/*.md"],
    resolve: {
        alias: {
            "@frontend": frontendSrc,
            "@shared": sharedSrc,
        },
        // react/react-dom must resolve to a single copy — enter pulls @pollinations/ui
        // (and @shared) which resolve React from the repo-root node_modules, while
        // enter's own code uses its local copy. Without dedupe that's two React
        // instances → "Invalid hook call". Mirrors pollinations.ai's vite config.
        dedupe: ["react", "react-dom", "zod"],
    },
    plugins: [
        tanstackRouter({
            target: "react",
            autoCodeSplitting: true,
            routesDirectory: "./src/routes",
            generatedRouteTree: "./src/routeTree.gen.ts",
        }),
        react(),
        tailwindcss(),
        cloudflare({ configPath: "../wrangler.toml" }),
        {
            // Swap %PUBLIC_ORIGIN% in index.html for this build's asset origin.
            name: "enter-public-origin",
            transformIndexHtml: (html) =>
                html.replaceAll("%PUBLIC_ORIGIN%", publicOrigin(mode)),
        },
    ],
    optimizeDeps: {
        esbuildOptions: {
            loader: {
                ".js": "jsx",
            },
        },
    },
    build: {
        outDir: "../dist",
        emptyOutDir: true,
    },
}));
