import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { loadGuide, loadOperation } from "./content.ts";

const root = fileURLToPath(new URL(".", import.meta.url));
const guidePath = fileURLToPath(
    new URL("../../BRING_YOUR_OWN_POLLEN.md", import.meta.url),
);
const referencePath = fileURLToPath(
    new URL("../../APIDOCS.md", import.meta.url),
);

export default defineConfig({
    root,
    base: "./",
    publicDir: false,
    // Preview output is separate from Gen's Worker/static assets and deploy builds.
    build: { outDir: "dist", emptyOutDir: true },
    server: { host: "127.0.0.1", port: 8790, strictPort: true },
    resolve: { dedupe: ["react", "react-dom"] },
    esbuild: { jsx: "automatic" },
    plugins: [
        // Same Tailwind entry as Enter (`@pollinations/ui/app.css`).
        tailwindcss(),
        {
            name: "docs-preview-content",
            resolveId(id) {
                if (id === "virtual:docs-preview") return `\0${id}`;
            },
            // Reads the committed sources and reference; never regenerates them.
            load(id) {
                if (id !== "\0virtual:docs-preview") return;
                this.addWatchFile(guidePath);
                this.addWatchFile(referencePath);
                return `export default ${JSON.stringify({
                    guide: loadGuide(guidePath),
                    operation: loadOperation(
                        referencePath,
                        "POST",
                        "/v1/chat/completions",
                    ),
                })}`;
            },
        },
    ],
});
