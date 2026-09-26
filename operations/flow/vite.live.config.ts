import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { ENTER_ORIGIN, RUNTIME_ORIGIN } from "./local-origins";
import { buildSourceStyles } from "./source-styles";

const here = fileURLToPath(new URL(".", import.meta.url));
const frontend = fileURLToPath(
    new URL("../../enter.pollinations.ai/frontend/", import.meta.url),
);
const moduleUrl = (file: string) => `/@fs/${here}${file}`;

export default defineConfig(({ command }) => ({
    root:
        command === "build"
            ? fileURLToPath(new URL("../../", import.meta.url))
            : frontend,
    publicDir: `${frontend}public`,
    envDir: false,
    define: {
        "import.meta.env.MODE": JSON.stringify("development"),
        "process.env.FLOW_PORT": JSON.stringify(
            process.env.FLOW_PORT ?? "4180",
        ),
    },
    assetsInclude: ["**/*.md"],
    resolve: {
        alias: {
            "@frontend": `${frontend}src`,
            "@shared": fileURLToPath(new URL("../../shared", import.meta.url)),
            "@pollinations/sdk/react": fileURLToPath(
                new URL(
                    "../../packages/sdk/src/react/index.ts",
                    import.meta.url,
                ),
            ),
            "@pollinations/sdk": fileURLToPath(
                new URL("../../packages/sdk/src/index.ts", import.meta.url),
            ),
            "@pollinations/ui/auth/sdk": fileURLToPath(
                new URL(
                    "../../packages/ui/src/modules/auth/sdk.ts",
                    import.meta.url,
                ),
            ),
            "@pollinations/ui/auth": fileURLToPath(
                new URL(
                    "../../packages/ui/src/modules/auth/index.ts",
                    import.meta.url,
                ),
            ),
            "@pollinations/ui/app-user-menu/sdk": fileURLToPath(
                new URL(
                    "../../packages/ui/src/modules/app-user-menu/sdk.ts",
                    import.meta.url,
                ),
            ),
            "@pollinations/ui/gen": fileURLToPath(
                new URL(
                    "../../packages/ui/src/modules/gen/index.ts",
                    import.meta.url,
                ),
            ),
            "@pollinations/ui/wallet": fileURLToPath(
                new URL(
                    "../../packages/ui/src/modules/wallet/index.ts",
                    import.meta.url,
                ),
            ),
            "@pollinations/ui/markdown": fileURLToPath(
                new URL("../../packages/ui/src/markdown.ts", import.meta.url),
            ),
            "@pollinations/ui/app.css": fileURLToPath(
                new URL(
                    "../../packages/ui/src/styles/app.css",
                    import.meta.url,
                ),
            ),
            "@pollinations/ui/styles.css": fileURLToPath(
                new URL("../../packages/ui/dist/styles.css", import.meta.url),
            ),
            "@pollinations/ui/brand": fileURLToPath(
                new URL("../../packages/ui/src/brand", import.meta.url),
            ),
            "@pollinations/ui/fonts": fileURLToPath(
                new URL("../../packages/ui/src/fonts", import.meta.url),
            ),
            // fonts.css uses paths relative to the published stylesheet.
            "./fonts": fileURLToPath(
                new URL("../../packages/ui/src/fonts", import.meta.url),
            ),
            "@pollinations/ui": fileURLToPath(
                new URL("../../packages/ui/src/index.ts", import.meta.url),
            ),
        },
        dedupe: ["react", "react-dom", "zod"],
    },
    optimizeDeps: {
        exclude: ["@pollinations/ui", "@pollinations/sdk"],
    },
    server: {
        host: "localhost",
        port: Number(new URL(ENTER_ORIGIN).port),
        strictPort: true,
        fs: {
            allow: [fileURLToPath(new URL("../../", import.meta.url))],
            deny: [
                "**/.env*",
                "**/*.{crt,pem}",
                "**/.git/**",
                "**/.dev.vars",
                "**/.dev.vars.*",
                "**/secrets/**",
                "**/.testingtokens",
                "**/.local/**",
            ],
        },
        proxy: {
            "^/(?:__flow|api|gen|auth)/": {
                target: RUNTIME_ORIGIN,
            },
        },
    },
    plugins: [
        tanstackRouter({
            target: "react",
            autoCodeSplitting: true,
            enableRouteGeneration: false,
            routesDirectory: `${frontend}src/routes`,
            generatedRouteTree: `${frontend}src/routeTree.gen.ts`,
        }),
        react(),
        tailwindcss(),
        tsconfigPaths({ projects: [`${here}tsconfig.flow.json`] }),
        {
            name: "flow-live-entries",
            buildStart: buildSourceStyles,
            async generateBundle() {
                this.emitFile({
                    type: "asset",
                    fileName: "flow-preview/moss.png",
                    source: await readFile(
                        `${here}public/flow-preview/moss.png`,
                    ),
                });
            },
            configureServer(server) {
                server.middlewares.use(async (request, response, next) => {
                    const path = request.url?.split("?")[0];
                    if (path === "/flow-preview/moss.png") {
                        try {
                            response.setHeader("Content-Type", "image/png");
                            response.end(
                                await readFile(
                                    `${here}public/flow-preview/moss.png`,
                                ),
                            );
                        } catch (error) {
                            next(error);
                        }
                        return;
                    }
                    const file =
                        path === "/flow"
                            ? "flow-flows.html"
                            : path === "/flow-example.html"
                              ? "flow-example.html"
                              : path === "/flow-admin.html"
                                ? "flow-admin.html"
                                : path === "/flow-screen.html"
                                  ? "flow-screen.html"
                                  : undefined;
                    if (!file) return next();
                    try {
                        let html = await readFile(`${here}${file}`, "utf8");
                        html = html.replace(
                            /src="(?:\.\/|\/)((?:live-(?:admin|example)|flow-(?:canvas|screen))\.tsx)"/,
                            (_, name: string) => `src="${moduleUrl(name)}"`,
                        );
                        response.setHeader("Content-Type", "text/html");
                        response.end(
                            await server.transformIndexHtml(
                                request.url ?? "/flow",
                                html,
                            ),
                        );
                    } catch (error) {
                        next(error);
                    }
                });
            },
            transformIndexHtml: {
                order: "pre",
                handler(html) {
                    return html
                        .replaceAll("%PUBLIC_ORIGIN%", ENTER_ORIGIN)
                        .replace(
                            'href="/src/style.css"',
                            command === "build"
                                ? 'href="/enter.pollinations.ai/frontend/src/style.css"'
                                : 'href="/src/style.css"',
                        )
                        .replace(
                            'src="/src/main.tsx"',
                            `src="${moduleUrl("enter-entry.ts")}"`,
                        );
                },
            },
        },
    ],
    build: {
        outDir: `${here}dist-live`,
        emptyOutDir: true,
        target: "esnext",
        rollupOptions: {
            input: {
                flow: `${here}flow-flows.html`,
                screen: `${here}flow-screen.html`,
                example: `${here}flow-example.html`,
                admin: `${here}flow-admin.html`,
                enter: `${frontend}index.html`,
            },
        },
    },
}));
