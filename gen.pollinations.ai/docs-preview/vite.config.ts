import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const guidePath = fileURLToPath(
    new URL("../../BRING_YOUR_OWN_POLLEN.md", import.meta.url),
);
const referencePath = fileURLToPath(
    new URL("../../APIDOCS.md", import.meta.url),
);

// This preview reads the committed generated reference; it never regenerates it.
// Content selection stays in Node, outside the browser and the UI package.
function content() {
    const guide = readFileSync(guidePath, "utf8");
    const reference = readFileSync(referencePath, "utf8");
    const operation = reference
        .split("\n---\n")
        .find((section) =>
            section
                .trimStart()
                .startsWith("#### `POST` `/v1/chat/completions` —"),
        )
        ?.trim();
    if (!operation)
        throw new Error("Chat Completions is missing from APIDOCS.md");
    const request = operation.match(/```bash\n([\s\S]*?)\n```/)?.[1];
    if (!request) throw new Error("Chat Completions has no request example");
    return {
        guide,
        // The prototype includes one operation, so schema links use the full reference.
        operation: operation
            .replace(/^#### /, "## ")
            .replace(
                /\]\(#([^)]+)\)/g,
                "](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md#$1)",
            ),
        request,
    };
}

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
        {
            name: "docs-preview-content",
            resolveId(id) {
                if (id === "virtual:docs-preview") return `\0${id}`;
            },
            load(id) {
                if (id !== "\0virtual:docs-preview") return;
                this.addWatchFile(guidePath);
                this.addWatchFile(referencePath);
                return `export default ${JSON.stringify(content())}`;
            },
        },
    ],
});
