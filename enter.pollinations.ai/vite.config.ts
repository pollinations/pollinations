import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { Mode, plugin as markdown } from "vite-plugin-markdown";

export default defineConfig({
    server: { port: 3000 },
    plugins: [
        tanstackRouter({
            target: "react",
            autoCodeSplitting: true,
            routesDirectory: "./src/client/routes",
            generatedRouteTree: "./src/client/routeTree.gen.ts",
        }),
        react(),
        tailwindcss(),
        tsconfigPaths(),
        cloudflare(),
        markdown({ mode: [Mode.HTML] }),
    ],
    envPrefix: ["PUBLIC_"],
    optimizeDeps: {
        esbuildOptions: {
            loader: {
                ".js": "jsx",
            },
        },
    },
});
