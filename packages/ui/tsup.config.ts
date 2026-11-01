import { defineConfig } from "tsup";

export default defineConfig([
    {
        entry: {
            index: "src/index.ts",
            "auth/index": "src/modules/auth/index.ts",
            "auth/sdk": "src/modules/auth/sdk.ts",
            "app-user-menu/sdk": "src/modules/app-user-menu/sdk.ts",
            "gen/index": "src/modules/gen/index.ts",
            "wallet/index": "src/modules/wallet/index.ts",
            markdown: "src/markdown.ts",
        },
        format: ["esm"],
        dts: true,
        // Share stateful modules across the root and subpath entries.
        splitting: true,
        sourcemap: true,
        // Scoped clean: remove tsup's own JS/dts outputs (incl. stale ones from
        // renamed modules) but PRESERVE the static files copied by the later build
        // steps (fonts, brand, licenses, css). A blanket `clean: true` wipes all of
        // dist/ first, leaving a window where the fonts + logo don't exist — consumers
        // that serve them from this symlinked dist (e.g. the website in dev) then 404
        // and cache the miss. Preserving them removes that window entirely.
        clean: [
            "**/*",
            "!fonts/**",
            "!brand/**",
            "!licenses/**",
            "!styles.css",
            "!app.css",
            "!theme.css",
            "!index.browser.min.js",
            "!index.browser.min.js.map",
            "!connect.js",
            "!connect.js.map",
        ],
        minify: false,
        external: [
            "@pollinations/sdk",
            "@pollinations/sdk/react",
            "react",
            "react-dom",
        ],
        loader: {
            ".svg": "dataurl",
        },
    },
    {
        entry: {
            index: "src/index.ts",
        },
        format: ["iife"],
        globalName: "PollinationsUI",
        outDir: "dist",
        platform: "browser",
        splitting: false,
        sourcemap: true,
        minify: true,
        dts: false,
        clean: false,
        outExtension: () => ({ js: ".browser.min.js" }),
        loader: {
            ".svg": "dataurl",
        },
        esbuildOptions(options) {
            options.alias = {
                react: "./src/browser/react-global.ts",
                "react-dom": "./src/browser/react-dom-global.ts",
                "react/jsx-runtime":
                    "./src/browser/react-jsx-runtime-global.ts",
                "react/jsx-dev-runtime":
                    "./src/browser/react-jsx-runtime-global.ts",
            };
        },
    },
    // <polli-connect> as one script for any page: React, the SDK and the
    // account menu are bundled in; the stylesheet loads from beside it.
    {
        entry: { connect: "src/browser/connect.tsx" },
        format: ["iife"],
        outDir: "dist",
        platform: "browser",
        splitting: false,
        sourcemap: true,
        minify: true,
        dts: false,
        clean: false,
        noExternal: [/.*/],
        outExtension: () => ({ js: ".js" }),
        define: { "process.env.NODE_ENV": '"production"' },
        loader: {
            ".svg": "dataurl",
        },
    },
]);
