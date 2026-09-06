import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    target: "node20",
    outDir: "dist",
    clean: true,
    dts: true,
    sourcemap: true,
    splitting: false,
    loader: { ".md": "text" },
    noExternal: [],
    external: ["@modelcontextprotocol/sdk", "zod"],
});
