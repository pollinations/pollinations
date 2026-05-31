import { defineConfig } from "tsup";

export default defineConfig({
    entry: {
        index: "src/index.ts",
        "auth/index": "src/modules/auth/index.ts",
        "modality/index": "src/modules/modality/index.ts",
        "permissions/index": "src/modules/permissions/index.ts",
        "showcase/index": "src/showcase/index.ts",
        "shell/index": "src/modules/shell/index.ts",
        "wallet/index": "src/modules/wallet/index.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    minify: false,
    external: ["@pollinations_ai/sdk", "@pollinations_ai/sdk/react", "react"],
});
