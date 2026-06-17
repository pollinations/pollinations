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
        alias: [
            // piexif-ts package.json points "module"/"browser" at non-existent files;
            // pin resolution to the published UMD bundle that actually ships.
            { find: /^piexif-ts$/, replacement: "piexif-ts/dist/piexif.js" },
        ],
    },
    plugins: [tsconfigPaths(), cloudflare()],
});
