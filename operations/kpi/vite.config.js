import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react(), tailwindcss(), cloudflare()],
    server: { host: "localhost", port: 3457, strictPort: true },
    resolve: {
        dedupe: ["react", "react-dom"],
    },
});
