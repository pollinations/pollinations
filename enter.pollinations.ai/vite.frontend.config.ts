import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    server: {
        port: 3000,
        allowedHosts: [".trycloudflare.com"],
    },
    assetsInclude: ["**/*.md"],
    resolve: {
        dedupe: ["zod"],
    },
    plugins: [
        tanstackRouter({
            target: "react",
            autoCodeSplitting: true,
            routesDirectory: "./frontend/src/routes",
            generatedRouteTree: "./frontend/src/routeTree.gen.ts",
        }),
        react(),
        tailwindcss(),
        tsconfigPaths(),
    ],
    envPrefix: ["PUBLIC_"],
    optimizeDeps: {
        esbuildOptions: {
            loader: {
                ".js": "jsx",
            },
        },
    },
    build: {
        outDir: "dist/client",
        emptyOutDir: true,
    },
});
