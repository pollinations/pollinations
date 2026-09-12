import { copyFileSync, cpSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const here = fileURLToPath(new URL(".", import.meta.url));
const output = fileURLToPath(new URL("../dist/connect-lab", import.meta.url));

// An isolated static simulator: no Worker, environment secrets or live account API.
export default defineConfig({
    root: here,
    envDir: false,
    publicDir: false,
    assetsInclude: ["**/*.md"],
    define: { "import.meta.env.MODE": JSON.stringify("development") },
    resolve: {
        alias: {
            "@shared": fileURLToPath(new URL("../../shared", import.meta.url)),
            "@pollinations/ui/brand": fileURLToPath(
                new URL("../../packages/ui/src/brand", import.meta.url),
            ),
        },
        dedupe: ["react", "react-dom", "zod"],
    },
    plugins: [
        tanstackRouter({
            target: "react",
            autoCodeSplitting: true,
            routesDirectory: `${here}src/routes`,
            generatedRouteTree: `${here}src/routeTree.gen.ts`,
        }),
        react(),
        tailwindcss(),
        tsconfigPaths({ projects: [`${here}src/tsconfig.json`] }),
        {
            name: "connect-lab-static-entry",
            closeBundle() {
                copyFileSync(
                    `${output}/pollen-connect-flows.html`,
                    `${output}/index.html`,
                );
                for (const directory of [
                    "pollen-connect-preview",
                    "brand-logos",
                ])
                    cpSync(
                        `${here}public/${directory}`,
                        `${output}/${directory}`,
                        { recursive: true },
                    );
                writeFileSync(
                    `${output}/robots.txt`,
                    "User-agent: *\nDisallow: /\n",
                );
                writeFileSync(
                    `${output}/_headers`,
                    `/*
  X-Robots-Tag: noindex, nofollow
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://gen.pollinations.ai; frame-src 'self'; form-action 'none'; object-src 'none'; base-uri 'self'
`,
                );
            },
        },
    ],
    build: {
        outDir: output,
        emptyOutDir: true,
        target: "esnext",
        rollupOptions: {
            input: {
                lab: `${here}pollen-connect-flows.html`,
                screen: `${here}pollen-connect-screen.html`,
            },
        },
    },
});
