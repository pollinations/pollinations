import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";
import { codeAgentSdk } from "./scripts/code-agent-sdk.mjs";

const sharedSrc = fileURLToPath(new URL("../shared/", import.meta.url));
const frontendSrc = fileURLToPath(new URL("./frontend/src/", import.meta.url));
const enterSrc = fileURLToPath(new URL("./src/", import.meta.url));

export default defineConfig(async ({ mode }) => {
    const migrationsPath = path.join(__dirname, "drizzle");
    const migrations = await readD1Migrations(migrationsPath);
    // wrangler.toml declares [assets] directory = "dist/client". The Workers
    // pool refuses to start when it is missing, and backend tests do not need
    // a frontend build, so make sure the directory exists.
    mkdirSync(path.join(__dirname, "dist", "client"), { recursive: true });
    // Deployed Workers run in UTC; local workerd follows the host timezone.
    process.env.TZ = "UTC";
    const env = loadEnv(mode, process.cwd(), "");

    return {
        plugins: [
            tsconfigPaths(),
            codeAgentSdk(),
            cloudflareTest({
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
                                            description: "Code hosting",
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
            }),
        ],
        resolve: {
            dedupe: ["zod"],
            alias: [
                { find: /^@\/(.*)$/, replacement: `${enterSrc}$1` },
                { find: /^@shared\/(.*)$/, replacement: `${sharedSrc}$1` },
                { find: /^@frontend\/(.*)$/, replacement: `${frontendSrc}$1` },
            ],
        },
        test: {
            // Vitest's console interception can deadlock the Workers pool when a
            // handler logs during a file's last RPC (cloudflare/workers-sdk#15719).
            disableConsoleIntercept: true,
            setupFiles: [
                "./test/setup/apply-migrations.ts",
                "./test/setup/rejection-handler.ts",
            ],
            exclude: [
                ...configDefaults.exclude,
                "test/e2e/**",
                "scripts/**",
                "observability/scripts/**",
            ],
            reporters: ["default"],
            teardownTimeout: 5000,
        },
    };
});
