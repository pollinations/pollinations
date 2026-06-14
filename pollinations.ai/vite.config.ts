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
        tanstackRouter({
            target: "react",
            autoCodeSplitting: true,
            routesDirectory: "./src/routes",
            generatedRouteTree: "./src/routeTree.gen.ts",
        }),
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
        dedupe: ["react", "react-dom"],
    },
    server: {
        // Fixed dev origin — the pk_ app key's auth redirect allowlist is pinned to
        // http://127.0.0.1:4178. Must be 127.0.0.1 (not localhost) and exactly 4178;
        // strictPort makes vite fail rather than drift to another port and break login.
        host: "127.0.0.1",
        port: 4178,
        strictPort: true,
        open: true,
    },
    build: {
        reportCompressedSize: true,
    },
    optimizeDeps: {
        esbuildOptions: {
            loader: {
                ".js": "jsx",
            },
        },
    },
});
