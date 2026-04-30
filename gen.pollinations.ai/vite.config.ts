import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    server: {
        port: 8788,
    },
    assetsInclude: ["**/*.md"],
    resolve: {
        dedupe: ["zod"],
    },
    plugins: [tsconfigPaths(), cloudflare()],
});
