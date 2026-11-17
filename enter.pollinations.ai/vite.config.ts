import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { createElement } from "react";
import { defineConfig } from "vite";
import {
    NOT_FOUND_META,
    PAGE_TITLES,
    pageHtml,
    pageMeta,
} from "./frontend/src/page-meta.ts";
import { codeAgentSdk } from "./scripts/code-agent-sdk.mjs";

const frontendSrc = fileURLToPath(new URL("./frontend/src", import.meta.url));
const sharedSrc = fileURLToPath(new URL("../shared", import.meta.url));
const rootReact = fileURLToPath(
    new URL("../node_modules/react", import.meta.url),
);
const rootReactDom = fileURLToPath(
    new URL("../node_modules/react-dom", import.meta.url),
);

// The origin that serves THIS deployment's static assets, so social-preview
// image tags (og:image / twitter:image) resolve to the build's own amber card
// instead of always pointing at production. og:url / canonical stay production
// (content identity). `.env` is gitignored here, so this lives in the config.
const publicOrigin = (mode: string) =>
    mode === "staging"
        ? "https://staging.enter.myceli.ai"
        : "https://enter.pollinations.ai";

// Account emails load these from fixed URLs, so the build copies them from the
// brand kit unhashed. ponytail: build only, `vite dev` serves no email images.
const EMAIL_BRAND = {
    "email/polli-lockup.png":
        "@pollinations/ui/brand/polli/polli-lockup-horizontal-black.png",
    "email/mark.png": "@pollinations/ui/brand/mark-black.png",
};

export default defineConfig(({ command, mode }) => ({
    root: "frontend",
    server: {
        port: 3000,
        // Let Enter handle credentialed dashboard preflights instead of Vite.
        cors: false,
        allowedHosts: [".trycloudflare.com"],
    },
    publicDir: "public",
    assetsInclude: ["**/*.md"],
    resolve: {
        alias: {
            "@frontend": frontendSrc,
            "@shared": sharedSrc,
            react: rootReact,
            "react-dom": rootReactDom,
        },
        // react/react-dom must resolve to a single copy — enter pulls @pollinations/ui
        // (and @shared) which resolve React from the repo-root node_modules, while
        // enter's own code uses its local copy. Without dedupe that's two React
        // instances → "Invalid hook call". Mirrors pollinations.ai's vite config.
        dedupe: ["react", "react-dom", "zod"],
    },
    plugins: [
        codeAgentSdk(),
        tanstackRouter({
            target: "react",
            autoCodeSplitting: true,
            routesDirectory: "./src/routes",
            generatedRouteTree: "./src/routeTree.gen.ts",
        }),
        react(),
        tailwindcss(),
        cloudflare({
            configPath: "../wrangler.toml",
            // `vite dev` has no per-page HTML files, so it keeps the SPA
            // fallback.
            config:
                command === "serve"
                    ? {
                          assets: {
                              not_found_handling: "single-page-application",
                          },
                      }
                    : undefined,
            persistState: {
                path: fileURLToPath(
                    new URL("./.wrangler/state", import.meta.url),
                ),
            },
        }),
        {
            // Swap %PUBLIC_ORIGIN% in index.html for this build's asset origin.
            name: "enter-public-origin",
            transformIndexHtml: (html) =>
                html.replaceAll("%PUBLIC_ORIGIN%", publicOrigin(mode)),
        },
        {
            // A copy of index.html per page with that page's metadata, and
            // 404.html, which `not_found_handling = "404-page"` serves with a
            // 404 status for unknown paths.
            name: "enter-page-html",
            applyToEnvironment: (environment) => environment.name === "client",
            generateBundle: {
                order: "post",
                handler(_, bundle) {
                    const index = bundle["index.html"];
                    if (index?.type !== "asset")
                        throw new Error("index.html is missing");
                    const html = String(index.source);
                    for (const path of Object.keys(PAGE_TITLES)) {
                        const meta = pageMeta(path);
                        if (!meta || path === "/") continue;
                        this.emitFile({
                            type: "asset",
                            fileName: `${path.slice(1)}.html`,
                            source: pageHtml(html, meta),
                        });
                    }
                    this.emitFile({
                        type: "asset",
                        fileName: "404.html",
                        source: pageHtml(html, NOT_FOUND_META),
                    });
                },
            },
        },
        {
            name: "enter-email-brand",
            applyToEnvironment: (environment) => environment.name === "client",
            async generateBundle() {
                for (const [fileName, asset] of Object.entries(EMAIL_BRAND)) {
                    this.emitFile({
                        type: "asset",
                        fileName,
                        source: readFileSync(
                            fileURLToPath(import.meta.resolve(asset)),
                        ),
                    });
                }
                // The UI kit's icons the emails show, in their text colour, as
                // PNGs because email clients drop SVG.
                const [ui, { renderToStaticMarkup }, sharp] = await Promise.all(
                    [
                        import("@pollinations/ui"),
                        import("react-dom/server"),
                        import("sharp").then((m) => m.default),
                    ],
                );
                // Ink, and the wallet's --polli-color-paid-deep as hex for the
                // paid card.
                const icons = [
                    ["email/card.png", ui.CardIcon, "#6c4800"],
                    ["email/website.png", ui.GlobeIcon, "#1d1420"],
                    ["email/dashboard.png", ui.AppIcon, "#1d1420"],
                    ["email/github.png", ui.GitHubIcon, "#1d1420"],
                    ["email/discord.png", ui.DiscordIcon, "#1d1420"],
                ] as const;
                for (const [fileName, Icon, color] of icons) {
                    const svg = renderToStaticMarkup(
                        createElement(Icon, {
                            color,
                            width: 64,
                            height: 64,
                            xmlns: "http://www.w3.org/2000/svg",
                        }),
                    );
                    this.emitFile({
                        type: "asset",
                        fileName,
                        source: await sharp(Buffer.from(svg)).png().toBuffer(),
                    });
                }
            },
        },
    ],
    optimizeDeps: {
        esbuildOptions: {
            loader: {
                ".js": "jsx",
            },
        },
    },
    build: {
        outDir: "../dist",
        emptyOutDir: true,
    },
}));
