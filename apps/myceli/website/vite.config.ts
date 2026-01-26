import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig(() => {
    return {
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "."),
            },
        },
        build: {
            outDir: "dist",
            emptyOutDir: true,
            rollupOptions: {
                output: {
                    manualChunks: undefined,
                },
            },
        },
        plugins: [
            {
                name: "spa-fallback",
                closeBundle() {
                    // Copy index.html to 404.html for SPA routing on Cloudflare Pages
                    // When users navigate to /foo directly, Cloudflare serves 404.html,
                    // which loads the React app and handles routing client-side
                    if (fs.existsSync("./dist/index.html")) {
                        fs.copyFileSync("./dist/index.html", "./dist/404.html");
                        console.log(
                            "✅ Copied index.html to 404.html for Cloudflare Pages SPA support",
                        );
                    }
                },
            },
        ],
    };
});
