import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    defineWorkersConfig,
    readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";
import { loadEnv } from "vite";
import { configDefaults, defineConfig } from "vitest/config";

const genSrc = fileURLToPath(new URL("./src/", import.meta.url));
const sharedSrc = fileURLToPath(new URL("../shared/", import.meta.url));

const genAliases = [
    "content-filter.ts",
    "cache",
    "durable-objects/PollenRateLimiter.ts",
    "durable-objects/GenerationCoordinator.ts",
    "env.ts",
    "error.ts",
    "events.ts",
    "logger",
    "logger.ts",
    "middleware/auth.ts",
    "middleware/balance.ts",
    "middleware/generation-cache.ts",
    "middleware/generation-deduplication.ts",
    "middleware/logger.ts",
    "middleware/media-cache.ts",
    "middleware/model.ts",
    "middleware/rate-limit-durable.ts",
    "middleware/rate-limit-edge.ts",
    "middleware/safety.ts",
    "middleware/text-cache.ts",
    "middleware/track.ts",
    "middleware/validator.ts",
    "routes/generation-executor.ts",
    "schemas/embeddings.ts",
    "schemas/image.ts",
    "schemas/model3d.ts",
    "schemas/models.ts",
    "schemas/realtime.ts",
    "schemas/text.ts",
    "userImage.ts",
    "util",
    "util.ts",
    "utils/api-docs.ts",
    "utils/bedrock-guardrail.ts",
    "utils/execute-generation.ts",
    "utils/generation-access.ts",
    "utils/media-cache.ts",
    "utils/model-stats.ts",
    "utils/safety-features.ts",
    "utils/text-cache.ts",
];

const baseConfig = defineConfig({
    resolve: {
        dedupe: ["hono", "hono-openapi"],
        alias: [
            ...genAliases.map((path) => ({
                find: `@/${path}`,
                replacement: `${genSrc}${path}`,
            })),
            {
                find: /^@\/embeddings\/(.*)$/,
                replacement: `${genSrc}embeddings/$1`,
            },
            {
                find: /^@\/text\/(.*)$/,
                replacement: `${genSrc}text/$1`,
            },
            {
                find: /^@\/image\/(.*)$/,
                replacement: `${genSrc}image/$1`,
            },
            {
                find: /^@\/model3d\/(.*)$/,
                replacement: `${genSrc}model3d/$1`,
            },
            {
                find: /^@shared\/(.*)$/,
                replacement: `${sharedSrc}$1`,
            },
            // piexif-ts package.json points "module"/"browser" at non-existent files;
            // pin resolution to the published UMD bundle that actually ships.
            { find: /^piexif-ts$/, replacement: "piexif-ts/dist/piexif.js" },
        ],
    },
});

export default defineWorkersConfig(async ({ mode }) => {
    const migrationsPath = path.join(
        __dirname,
        "../enter.pollinations.ai/drizzle",
    );
    const migrations = await readD1Migrations(migrationsPath);
    const env = loadEnv(mode, process.cwd(), "");

    return {
        ...baseConfig,
        test: {
            globalSetup: ["./test/setup/snapshot-server.ts"],
            setupFiles: ["./test/setup/apply-migrations.ts"],
            exclude: [...configDefaults.exclude],
            deps: {
                optimizer: {
                    ssr: {
                        enabled: true,
                        include: ["better-auth", "drizzle-orm"],
                    },
                },
            },
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
                            TEST_VCR_MODE:
                                env.TEST_VCR_MODE || "replay-or-record",
                        },
                        serviceBindings: {
                            ENTER: async (request: Request) => {
                                const url = new URL(request.url);
                                if (
                                    url.pathname ===
                                    "/api/docs/open-api/generate-schema"
                                ) {
                                    return Response.json({
                                        openapi: "3.1.0",
                                        info: {
                                            title: "Enter",
                                            version: "0.0.0",
                                        },
                                        paths: {},
                                        components: {},
                                    });
                                }
                                return new Response("enter test stub");
                            },
                            POLLINATIONS_MCP: async (request: Request) => {
                                if (
                                    !request.headers.has("authorization") ||
                                    request.headers.has("cookie")
                                ) {
                                    return new Response(
                                        "Caller authorization was not forwarded safely",
                                        { status: 500 },
                                    );
                                }
                                const payload = (await request.json()) as {
                                    jsonrpc: string;
                                    id?: string | number;
                                };
                                return Response.json({
                                    jsonrpc: payload.jsonrpc,
                                    id: payload.id,
                                    result: {
                                        content: [
                                            {
                                                type: "text",
                                                text: "pollinations proxied",
                                            },
                                        ],
                                    },
                                });
                            },
                            FFMPEG_MCP: async (request: Request) => {
                                if (
                                    request.headers.has("authorization") ||
                                    request.headers.has("cookie")
                                ) {
                                    return new Response(
                                        "Caller credentials reached MCP",
                                        { status: 500 },
                                    );
                                }
                                const payload = (await request.json()) as {
                                    jsonrpc: string;
                                    id?: string | number;
                                    method?: string;
                                };
                                const headers = new Headers({
                                    "Content-Type": "application/json",
                                });
                                if (payload.method === "tools/call") {
                                    headers.set(
                                        "x-pollinations-mcp-cost",
                                        "0.25",
                                    );
                                    headers.set(
                                        "x-pollinations-mcp-tool",
                                        "runFfmpeg",
                                    );
                                    headers.set(
                                        "x-pollinations-mcp-status",
                                        "200",
                                    );
                                    headers.set(
                                        "x-pollinations-mcp-adjustment-id",
                                        "cloudflare.container.basic_runtime.v1",
                                    );
                                    headers.set(
                                        "x-pollinations-mcp-adjustment-units",
                                        "1",
                                    );
                                }
                                return Response.json(
                                    {
                                        jsonrpc: payload.jsonrpc,
                                        id: payload.id,
                                        result: {
                                            content: [
                                                {
                                                    type: "text",
                                                    text: "ffmpeg proxied",
                                                },
                                            ],
                                        },
                                    },
                                    { headers },
                                );
                            },
                            EXA_MCP: async (request: Request) => {
                                if (
                                    request.headers.has("authorization") ||
                                    request.headers.has("cookie")
                                ) {
                                    return new Response(
                                        "Caller credentials reached MCP",
                                        { status: 500 },
                                    );
                                }
                                const payload = (await request.json()) as {
                                    jsonrpc: string;
                                    id?: string | number;
                                    method?: string;
                                };
                                const headers = new Headers({
                                    "Content-Type": "application/json",
                                });
                                if (payload.method === "tools/call") {
                                    headers.set(
                                        "x-pollinations-mcp-cost",
                                        "0.007",
                                    );
                                    headers.set(
                                        "x-pollinations-mcp-tool",
                                        "web_search_exa",
                                    );
                                    headers.set(
                                        "x-pollinations-mcp-status",
                                        "200",
                                    );
                                    headers.set(
                                        "x-pollinations-mcp-adjustment-id",
                                        "exa.search.v1",
                                    );
                                    headers.set(
                                        "x-pollinations-mcp-adjustment-units",
                                        "1",
                                    );
                                }
                                return Response.json(
                                    {
                                        jsonrpc: payload.jsonrpc,
                                        id: payload.id,
                                        result: {
                                            content: [
                                                {
                                                    type: "text",
                                                    text: "exa proxied",
                                                },
                                            ],
                                        },
                                    },
                                    { headers },
                                );
                            },
                            COMPOSIO_MCP: async (request: Request) => {
                                if (
                                    request.headers.has("authorization") ||
                                    request.headers.has("cookie") ||
                                    !request.headers.has(
                                        "x-pollinations-user-id",
                                    )
                                ) {
                                    return new Response(
                                        "Caller identity was not forwarded safely",
                                        { status: 500 },
                                    );
                                }
                                const payload = (await request.json()) as {
                                    jsonrpc: string;
                                    id?: string | number;
                                };
                                const identity = request.headers.get(
                                    "x-pollinations-user-id",
                                );
                                return Response.json({
                                    jsonrpc: payload.jsonrpc,
                                    id: payload.id,
                                    result: {
                                        content: [
                                            {
                                                type: "text",
                                                text: identity,
                                            },
                                        ],
                                    },
                                });
                            },
                            ROBOTIC_ROBOT_MCP: async (request: Request) => {
                                const pathname = new URL(request.url).pathname;
                                if (
                                    request.headers.has("authorization") ||
                                    request.headers.has("cookie")
                                ) {
                                    return new Response(
                                        "Caller credentials reached MCP",
                                        { status: 500 },
                                    );
                                }
                                const payload = (await request.json()) as {
                                    jsonrpc: string;
                                    id?: string | number;
                                    method?: string;
                                };
                                const headers = new Headers({
                                    "Content-Type": "application/json",
                                });
                                if (payload.method === "tools/call") {
                                    const isRunJs = pathname === "/run-js";
                                    headers.set(
                                        "x-pollinations-mcp-cost",
                                        isRunJs ? "0.0008" : "0.0001",
                                    );
                                    headers.set(
                                        "x-pollinations-mcp-tool",
                                        isRunJs ? "run-js" : "time",
                                    );
                                    headers.set(
                                        "x-pollinations-mcp-status",
                                        "200",
                                    );
                                    headers.set(
                                        "x-pollinations-mcp-adjustment-id",
                                        isRunJs
                                            ? "robotic_robot.run_js.0_01_vcpu.v1"
                                            : "robotic_robot.time.v1",
                                    );
                                    headers.set(
                                        "x-pollinations-mcp-adjustment-units",
                                        "1",
                                    );
                                }
                                return Response.json(
                                    {
                                        jsonrpc: payload.jsonrpc,
                                        id: payload.id,
                                        result: {
                                            content: [
                                                {
                                                    type: "text",
                                                    text: "robotic robot proxied",
                                                },
                                            ],
                                        },
                                    },
                                    { headers },
                                );
                            },
                        },
                    },
                },
            },
        },
    };
});
