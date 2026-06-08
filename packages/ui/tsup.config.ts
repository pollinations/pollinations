import { defineConfig } from "tsup";

const emitDeclarations = process.env.UI_BUILD_DTS !== "false";

export default defineConfig({
    entry: {
        index: "src/index.ts",
        "auth/index": "src/modules/auth/index.ts",
        "auth/sdk": "src/modules/auth/sdk.ts",
        "app-user-menu/sdk": "src/modules/app-user-menu/sdk.ts",
        "gen/index": "src/modules/gen/index.ts",
        "wallet/index": "src/modules/wallet/index.ts",
        "wallet/sdk": "src/modules/wallet/sdk.ts",
    },
    format: ["esm", "cjs"],
    dts: emitDeclarations,
    splitting: false,
    sourcemap: true,
    // Scoped clean: remove tsup's own JS/dts outputs (incl. stale ones from
    // renamed modules) but PRESERVE the static files copied by the later build
    // steps (fonts, assets, licenses, css). A blanket `clean: true` wipes all of
    // dist/ first, leaving a window where the fonts + logo don't exist — consumers
    // that serve them from this symlinked dist (e.g. the website in dev) then 404
    // and cache the miss. Preserving them removes that window entirely.
    clean: [
        "**/*",
        "!fonts/**",
        "!assets/**",
        "!licenses/**",
        "!styles.css",
        "!app.css",
    ],
    minify: false,
    external: [
        "@pollinations/sdk",
        "@pollinations/sdk/client",
        "@pollinations/sdk/react",
        "react",
    ],
    loader: {
        ".svg": "dataurl",
    },
});
