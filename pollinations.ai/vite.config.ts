import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import svgr from "vite-plugin-svgr";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
    plugins: [react(), tsconfigPaths(), svgr(), cloudflare()],
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
