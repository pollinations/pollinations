import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMcpUsageHeaders } from "../../shared/mcp-usage.ts";

const MAX_RUN_MS = 10_000;
const BASIC_CONTAINER_COST_PER_SECOND =
    0.25 * 0.00002 + 1 * 0.0000025 + 4 * 0.00000007;
const ADJUSTMENT_ID = "cloudflare.container.basic_runtime.v1";

class PythonFailure extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

async function runPython(params, env, getContainerImpl, reportUsage) {
    const startedAt = Date.now();
    const container = getContainerImpl(
        env.PYTHON,
        `python-${crypto.randomUUID()}`,
    );
    let status = 200;
    let errorMessage;
    let result;
    try {
        result = await container.run(params.code, startedAt + MAX_RUN_MS);
        if (result.exitCode !== 0) {
            status = 422;
            errorMessage =
                result.stderr ||
                result.stdout ||
                `Python exited ${result.exitCode}`;
        }
    } catch (error) {
        status = 502;
        errorMessage =
            error instanceof Error ? error.message : "Python container failed";
    } finally {
        await container.destroy().catch(() => undefined);
    }

    const durationMs = Date.now() - startedAt;
    reportUsage({
        cost: (durationMs / 1000) * BASIC_CONTAINER_COST_PER_SECOND,
        tool: "runPython",
        status,
        adjustmentId: ADJUSTMENT_ID,
        adjustmentUnits: durationMs / 1000,
        error: errorMessage,
    });
    if (errorMessage) throw new PythonFailure(status, errorMessage);
    const output = [result.stdout, result.stderr]
        .filter(Boolean)
        .join("\n")
        .trim();
    return {
        content: [
            {
                type: "text",
                text: output || "Execution completed without output.",
            },
        ],
    };
}

function buildServer(env, getContainerImpl, reportUsage) {
    const server = new McpServer(
        { name: "pollinations-python-mcp", version: "0.1.0" },
        {
            instructions:
                "Run short, self-contained Python calculations in an ephemeral container without network access.",
            capabilities: { tools: {} },
        },
    );
    server.registerTool(
        "runPython",
        {
            description:
                "Run Python 3 code in a fresh network-disabled container for up to 10 seconds. Returns stdout and stderr. Billed for active container time in Pollen.",
            inputSchema: z.object({
                code: z.string().min(1).max(20_000),
            }),
        },
        (params) => runPython(params, env, getContainerImpl, reportUsage),
    );
    return server;
}

export function createWorker({ getContainerImpl }) {
    return {
        async fetch(request, env) {
            if (new URL(request.url).pathname !== "/") {
                return new Response("Not found", { status: 404 });
            }
            if (
                request.method === "POST" &&
                Array.isArray(
                    await request
                        .clone()
                        .json()
                        .catch(() => null),
                )
            ) {
                return Response.json(
                    {
                        error: "invalid_request",
                        message: "Batch requests are not supported.",
                    },
                    { status: 400 },
                );
            }

            let usage;
            const handler = createMcpHandler(
                () =>
                    buildServer(env, getContainerImpl, (reportedUsage) => {
                        usage = reportedUsage;
                    }),
                {
                    legacy: "stateless",
                    onerror: (error) => console.error(error),
                },
            );
            const response = await handler.fetch(request);
            const body = await response.arrayBuffer();
            return withMcpUsageHeaders(new Response(body, response), usage);
        },
    };
}
