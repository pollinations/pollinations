import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    root: "frontend",
    server: {
        port: 3000,
        allowedHosts: [".trycloudflare.com"],
    },
    publicDir: "public",
    assetsInclude: ["**/*.md"],
    resolve: {
        dedupe: ["zod"],
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
        tsconfigPaths(),
        cloudflare({ configPath: "../wrangler.toml" }),
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
});
