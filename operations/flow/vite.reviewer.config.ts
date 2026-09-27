import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { buildSourceStyles } from "./source-styles";

export default defineConfig({
    root: fileURLToPath(new URL("./reviewer", import.meta.url)),
    base: "/flow-reviewer/",
    envDir: false,
    plugins: [
        react(),
        tailwindcss(),
        tsconfigPaths({
            projects: [
                fileURLToPath(new URL("./tsconfig.flow.json", import.meta.url)),
            ],
        }),
        { name: "flow-reviewer-styles", buildStart: buildSourceStyles },
    ],
    resolve: { dedupe: ["react", "react-dom"] },
    build: {
        outDir: "../dist/flow-reviewer",
        emptyOutDir: true,
    },
});
