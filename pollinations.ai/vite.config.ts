import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [react(), tailwindcss(), tsconfigPaths(), svgr(), cloudflare()],
    resolve: {
        alias: {
            "@shared": path.resolve(__dirname, "../shared"),
        },
    },
    build: {
        reportCompressedSize: true,
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: [
                        "react",
                        "react-dom",
                        "react-dom/client",
                        "react-router-dom",
                    ],
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
