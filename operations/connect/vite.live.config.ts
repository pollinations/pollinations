import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

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
    define: { "import.meta.env.MODE": JSON.stringify("development") },
    assetsInclude: ["**/*.md"],
    resolve: {
        alias: {
            "@frontend": `${frontend}src`,
            "@shared": fileURLToPath(new URL("../../shared", import.meta.url)),
            "@pollinations/ui/brand": fileURLToPath(
                new URL("../../packages/ui/src/brand", import.meta.url),
            ),
        },
        dedupe: ["react", "react-dom", "zod"],
    },
    server: {
        host: "localhost",
        port: 4180,
        strictPort: true,
        proxy: {
            "^/(?:__connect|api|gen|auth)/": {
                target: "http://localhost:4181",
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
        tsconfigPaths({ projects: [`${here}tsconfig.connect-lab.json`] }),
        {
            name: "connect-live-entries",
            configureServer(server) {
                server.middlewares.use(async (request, response, next) => {
                    const path = request.url?.split("?")[0];
                    if (path === "/pollen-connect-preview/agent.svg") {
                        try {
                            response.setHeader("Content-Type", "image/svg+xml");
                            response.end(
                                await readFile(
                                    fileURLToPath(
                                        new URL(
                                            "../../packages/ui/src/brand/mark.svg",
                                            import.meta.url,
                                        ),
                                    ),
                                ),
                            );
                        } catch (error) {
                            next(error);
                        }
                        return;
                    }
                    if (path === "/pollen-connect-preview/moss.png") {
                        try {
                            response.setHeader("Content-Type", "image/png");
                            response.end(
                                await readFile(
                                    `${here}public/pollen-connect-preview/moss.png`,
                                ),
                            );
                        } catch (error) {
                            next(error);
                        }
                        return;
                    }
                    const file =
                        path === "/connect"
                            ? "pollen-connect-flows.html"
                            : path === "/connect-example.html"
                              ? "connect-example.html"
                              : path === "/connect-admin.html"
                                ? "connect-admin.html"
                                : path === "/pollen-connect-screen.html"
                                  ? "pollen-connect-screen.html"
                                  : undefined;
                    if (!file) return next();
                    try {
                        let html = await readFile(`${here}${file}`, "utf8");
                        html = html.replace(
                            /src="(?:\.\/|\/)((?:live-(?:admin|example)|pollen-connect-(?:canvas|screen))\.tsx)"/,
                            (_, name: string) => `src="${moduleUrl(name)}"`,
                        );
                        response.setHeader("Content-Type", "text/html");
                        response.end(
                            await server.transformIndexHtml(
                                request.url ?? "/connect",
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
                        .replaceAll("%PUBLIC_ORIGIN%", "http://localhost:4180")
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
                connect: `${here}pollen-connect-flows.html`,
                screen: `${here}pollen-connect-screen.html`,
                example: `${here}connect-example.html`,
                admin: `${here}connect-admin.html`,
                enter: `${frontend}index.html`,
            },
        },
    },
}));
