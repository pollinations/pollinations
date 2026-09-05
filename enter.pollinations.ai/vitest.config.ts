import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    defineWorkersConfig,
    readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";
import { loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults } from "vitest/config";

const sharedSrc = fileURLToPath(new URL("../shared/", import.meta.url));
const frontendSrc = fileURLToPath(new URL("./frontend/src/", import.meta.url));
const enterSrc = fileURLToPath(new URL("./src/", import.meta.url));

export default defineWorkersConfig(async ({ mode }) => {
    const migrationsPath = path.join(__dirname, "drizzle");
    const migrations = await readD1Migrations(migrationsPath);
    const env = loadEnv(mode, process.cwd(), "");

    return {
        plugins: [tsconfigPaths()],
        resolve: {
            dedupe: ["react", "react-dom", "zod"],
            alias: [
                { find: /^@\/(.*)$/, replacement: `${enterSrc}$1` },
                { find: /^@shared\/(.*)$/, replacement: `${sharedSrc}$1` },
                { find: /^@frontend\/(.*)$/, replacement: `${frontendSrc}$1` },
            ],
        },
        test: {
            setupFiles: [
                "./test/setup/apply-migrations.ts",
                "./test/setup/rejection-handler.ts",
            ],
            exclude: [...configDefaults.exclude, "test/e2e/**", "scripts/**"],
            reporters: ["default"],
            teardownTimeout: 5000,
            poolOptions: {
                workers: {
                    singleWorker: true,
                    wrangler: {
                        configPath: "./wrangler.toml",
                        environment: env.TEST_ENV || "test",
                    },
                    miniflare: {
                        bindings: {
                            TEST_MIGRATIONS: migrations,
                        },
                        serviceBindings: {
                            COMPOSIO_MCP: async (request: Request) => {
                                const userId = request.headers.get(
                                    "x-pollinations-user-id",
                                );
                                if (!userId) {
                                    return Response.json(
                                        { message: "Missing user" },
                                        { status: 401 },
                                    );
                                }
                                const url = new URL(request.url);
                                if (url.pathname === "/connections") {
                                    if (request.method === "POST") {
                                        return Response.json({
                                            redirectUrl:
                                                "https://connect.composio.test/link",
                                        });
                                    }
                                    return Response.json({
                                        data: [
                                            {
                                                id: "ca_test",
                                                toolkit: "github",
                                                name: "GitHub",
                                                logo: "https://logos.composio.test/github",
                                                alias: null,
                                                status: "ACTIVE",
                                                userId,
                                            },
                                        ],
                                    });
                                }
                                if (url.pathname === "/toolkits") {
                                    return Response.json({
                                        data: [
                                            {
                                                slug: "github",
                                                name: "GitHub",
                                                description: "Code hosting",
                                                logo: null,
                                            },
                                        ],
                                    });
                                }
                                if (
                                    request.method === "DELETE" &&
                                    url.pathname === "/connections/ca_test"
                                ) {
                                    return new Response(null, { status: 204 });
                                }
                                return new Response("Not found", {
                                    status: 404,
                                });
                            },
                        },
                    },
                },
            },
            deps: {
                optimizer: {
                    ssr: {
                        enabled: true,
                        include: [
                            "better-auth",
                            "kysely",
                            "drizzle-orm",
                            "hono-openapi",
                        ],
                    },
                },
            },
        },
    };
});
