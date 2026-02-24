import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Configure base URL to match the subdirectory where the app is served
export default defineConfig({
    plugins: [react()],
    base: "/placeholder-generator/",
});
