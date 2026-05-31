import { defineConfig } from "tsup";

export default defineConfig({
    entry: [
        "src/index.ts",
        "src/auth/index.ts",
        "src/modality/index.ts",
        "src/permissions/index.ts",
        "src/showcase/index.ts",
        "src/wallet/index.ts",
    ],
    format: ["esm", "cjs"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    minify: false,
    external: ["@pollinations_ai/sdk", "@pollinations_ai/sdk/react", "react"],
});
