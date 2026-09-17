import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        ...(process.env.VITEST ? [] : [cloudflare()]),
    ],
    environments: {
        client: {
            build: {
                rollupOptions: {
                    output: {
                        manualChunks(id) {
                            if (id.endsWith("/provider-registry.json"))
                                return "provider-registry";
                        },
                        chunkFileNames(chunk) {
                            return chunk.name === "provider-registry"
                                ? "private/[name]-[hash].js"
                                : "assets/[name]-[hash].js";
                        },
                    },
                },
            },
        },
    },
    server: { host: "localhost", port: 4180, strictPort: true },
    resolve: {
        dedupe: ["react", "react-dom"],
    },
});
