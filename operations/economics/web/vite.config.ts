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
    server: { host: "localhost", port: 4180, strictPort: true },
    resolve: {
        dedupe: ["react", "react-dom"],
    },
});
