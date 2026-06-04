import { defineConfig } from "tsup";

export default defineConfig({
    entry: {
        index: "src/index.ts",
        "auth/index": "src/modules/auth/index.ts",
        "auth/sdk": "src/modules/auth/sdk.ts",
        "compositions/app-user": "src/compositions/app-user/index.ts",
        "modality/index": "src/modules/modality/index.ts",
        "models/index": "src/modules/models/index.ts",
        "wallet/index": "src/modules/wallet/index.ts",
        "wallet/sdk": "src/modules/wallet/sdk.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
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
