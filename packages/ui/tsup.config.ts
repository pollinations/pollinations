import { defineConfig } from "tsup";

export default defineConfig({
    entry: {
        index: "src/index.ts",
        "auth/index": "src/modules/auth/index.ts",
        "auth/sdk": "src/modules/auth/sdk.ts",
        "compositions/account": "src/compositions/account/index.ts",
        "modality/index": "src/modules/modality/index.ts",
        "wallet/index": "src/modules/wallet/index.ts",
        "wallet/sdk": "src/modules/wallet/sdk.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    minify: false,
    external: ["@pollinations/sdk", "@pollinations/sdk/react", "react"],
    loader: {
        ".svg": "dataurl",
    },
});
