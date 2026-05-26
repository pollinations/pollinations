import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const here = fileURLToPath(new URL(".", import.meta.url));
const apiProxyTarget = "http://localhost:3001";

export default defineConfig({
    root: here,
    server: {
        port: 3000,
        allowedHosts: [".trycloudflare.com"],
        proxy: {
            "/api": {
                target: apiProxyTarget,
                changeOrigin: true,
            },
        },
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
        tsconfigPaths({ projects: ["src/tsconfig.json"] }),
    ],
    optimizeDeps: {
        esbuildOptions: {
            loader: {
                ".js": "jsx",
            },
        },
    },
    build: {
        outDir: "../dist/client",
        emptyOutDir: true,
    },
});
