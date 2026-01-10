import { defineConfig } from "tsup";

export default defineConfig([
    // Node.js builds (ESM + CJS)
    {
        entry: ["src/index.ts"],
        format: ["esm", "cjs"],
        dts: true,
        splitting: false,
        sourcemap: true,
        clean: true,
        minify: false,
    },
    // Browser build (IIFE for CDN/script tag usage)
    {
        entry: ["src/index.ts"],
        format: ["iife"],
        globalName: "Pollinations",
        outDir: "dist",
        splitting: false,
        sourcemap: true,
        minify: true,
        outExtension: () => ({ js: ".browser.min.js" }),
        platform: "browser",
        external: ["fs", "react", "react-dom"],
        noExternal: [],
    },
]);
