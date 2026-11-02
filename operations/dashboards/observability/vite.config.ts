import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
    root: "frontend",
    plugins: [
        react(),
        tailwindcss(),
        cloudflare({
            configPath:
                process.env.OBSERVABILITY_LOCAL === "true"
                    ? "../wrangler.local.jsonc"
                    : "../wrangler.toml",
        }),
    ],
    server: { host: "localhost", port: 4000, strictPort: true },
    resolve: { dedupe: ["react", "react-dom"] },
    build: { outDir: "../dist", emptyOutDir: true },
});
