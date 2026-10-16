import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

// Builds into gen's static assets: the Worker serves /docs, which loads
// /docs-app/docs.js and /docs-app/docs.css from here.
export default defineConfig({
    root,
    base: "/docs-app/",
    publicDir: false,
    resolve: { dedupe: ["react", "react-dom"] },
    esbuild: { jsx: "automatic" },
    plugins: [tailwindcss()],
    build: {
        outDir: fileURLToPath(new URL("../public/docs-app", import.meta.url)),
        emptyOutDir: true,
        rollupOptions: {
            input: fileURLToPath(new URL("./main.tsx", import.meta.url)),
            output: {
                entryFileNames: "docs.js",
                chunkFileNames: "chunks/[name]-[hash].js",
                assetFileNames: (asset) =>
                    asset.names?.some((name) => name.endsWith(".css"))
                        ? "docs.css"
                        : "assets/[name]-[hash][extname]",
            },
        },
    },
});
