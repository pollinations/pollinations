import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Bundle the shared account menu, including React DOM's portal dependency.
// Source aliases let a clean checkout build without publishing SDK/UI first.
export default defineConfig({
    publicDir: false,
    plugins: [
        {
            name: "docs-brand-svg",
            enforce: "pre",
            async load(id) {
                if (!id.endsWith(".svg")) return;
                // BrandMark uses quoted CSS masks; Vite's SVG data URLs may
                // contain unescaped quotes. Base64 is safe in those masks.
                const svg = await readFile(id);
                return `export default "data:image/svg+xml;base64,${svg.toString("base64")}";`;
            },
        },
        tailwindcss(),
    ],
    esbuild: { jsx: "automatic" },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    resolve: {
        dedupe: ["react", "react-dom"],
        alias: {
            "@pollinations/sdk/react": source(
                "../packages/sdk/src/react/index.ts",
            ),
            "@pollinations/ui/app-user-menu/sdk": source(
                "../packages/ui/src/modules/app-user-menu/sdk.ts",
            ),
            "@pollinations/ui/styles.css": source(
                "../packages/ui/src/styles/index.css",
            ),
            "../../../packages/ui/src/styles/fonts": source(
                "../packages/ui/src/fonts",
            ),
        },
    },
    build: {
        outDir: "public/docs-assets",
        emptyOutDir: true,
        minify: true,
        lib: {
            entry: source("./src/docs-client/main.tsx"),
            formats: ["es"],
            fileName: () => "connect.js",
            cssFileName: "connect",
        },
    },
});
