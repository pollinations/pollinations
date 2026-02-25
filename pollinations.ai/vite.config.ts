import fs from "node:fs";
import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";
import tsconfigPaths from "vite-tsconfig-paths";

/** Serve local apps/APPS.md at /APPS.md during dev so categories stay in sync */
function serveLocalApps(): Plugin {
    return {
        name: "serve-local-apps",
        configureServer(server) {
            server.middlewares.use("/APPS.md", (_req, res) => {
                const content = fs.readFileSync(
                    path.resolve(__dirname, "../apps/APPS.md"),
                    "utf8",
                );
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                res.end(content);
            });
        },
    };
}

export default defineConfig({
    plugins: [serveLocalApps(), react(), tsconfigPaths(), svgr(), cloudflare()],
    resolve: {
        alias: {
            "@shared": path.resolve(__dirname, "../shared"),
        },
    },
    server: {
        open: true,
    },
    optimizeDeps: {
        esbuildOptions: {
            loader: {
                ".js": "jsx",
            },
        },
    },
});
