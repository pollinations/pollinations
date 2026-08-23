import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMcpUsageHeaders } from "../../shared/mcp-usage.ts";
import { MCP_CALLER_ID_HEADER } from "../../shared/registry/mcp.ts";

const BASIC_CONTAINER_COST_PER_SECOND =
    0.25 * 0.00002 + 1 * 0.0000025 + 4 * 0.00000007;
const ADJUSTMENT_ID = "cloudflare.container.basic_runtime.v1";
const MAX_OUTPUT_LENGTH = 64_000;

class SandboxFailure extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function workspacePath(value = ".") {
    const relative = value.replace(/^\/workspace\/?/, "");
    const parts = relative.split("/").filter((part) => part && part !== ".");
    if (
        value.startsWith("/") &&
        value !== "/workspace" &&
        !value.startsWith("/workspace/")
    ) {
        throw new SandboxFailure(400, "Path must be inside /workspace");
    }
    if (parts.includes("..")) {
        throw new SandboxFailure(400, "Path must be inside /workspace");
    }
    return parts.length ? `/workspace/${parts.join("/")}` : "/workspace";
}

function textResult(text) {
    return {
        content: [
            {
                type: "text",
                text: text.slice(-MAX_OUTPUT_LENGTH),
            },
        ],
    };
}

async function runSandboxTool({ tool, sandbox, reportUsage, operation }) {
    const startedAt = Date.now();
    let status = 200;
    let errorMessage;
    try {
        return await operation(sandbox);
    } catch (error) {
        status = error instanceof SandboxFailure ? error.status : 502;
        errorMessage =
            error instanceof Error ? error.message : "Sandbox operation failed";
        throw new SandboxFailure(status, errorMessage);
    } finally {
        const durationMs = Date.now() - startedAt;
        reportUsage({
            cost: (durationMs / 1000) * BASIC_CONTAINER_COST_PER_SECOND,
            tool,
            status,
            adjustmentId: ADJUSTMENT_ID,
            adjustmentUnits: durationMs / 1000,
            error: errorMessage,
        });
    }
}

function buildServer(env, callerId, getSandboxImpl, reportUsage) {
    const sandbox = getSandboxImpl(env.SANDBOX, callerId, {
        enableDefaultSession: false,
    });
    const run = (tool, operation) =>
        runSandboxTool({ tool, sandbox, reportUsage, operation });
    const server = new McpServer(
        { name: "pollinations-sandbox-mcp", version: "0.1.0" },
        {
            instructions:
                "Use the short-lived Linux sandbox for shell commands and files. Initialize it before use. Work under /workspace. The sandbox includes Git, Node.js, Python, curl, and common development tools, has internet access, and resets after inactivity.",
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        "container_initialize",
        {
            description:
                "Start a clean development sandbox. This deletes any previous files and processes for the caller.",
        },
        () =>
            run("container_initialize", async (target) => {
                await target.destroy();
                await target.ping();
                return textResult("Created a clean sandbox in /workspace.");
            }),
    );

    server.registerTool(
        "container_ping",
        { description: "Check whether the sandbox is available." },
        () =>
            run("container_ping", async (target) => {
                await target.ping();
                return textResult("Sandbox is running.");
            }),
    );

    server.registerTool(
        "container_exec",
        {
            description:
                "Run a shell command in the sandbox and return stdout, stderr, and the exit code.",
            inputSchema: z.object({
                command: z.string().min(1).max(20_000),
                timeoutMs: z.number().int().min(1_000).max(120_000).optional(),
            }),
        },
        ({ command, timeoutMs }) =>
            run("container_exec", async (target) => {
                const result = await target.exec(command, {
                    cwd: "/workspace",
                    timeout: timeoutMs ?? 60_000,
                });
                const output = [result.stdout, result.stderr]
                    .filter(Boolean)
                    .join("\n")
                    .trim();
                if (!result.success) {
                    throw new SandboxFailure(
                        422,
                        output || `Command exited ${result.exitCode}`,
                    );
                }
                return textResult(
                    `${output || "Command completed without output."}\n\nExit code: ${result.exitCode}`,
                );
            }),
    );

    server.registerTool(
        "container_file_write",
        {
            description:
                "Create or overwrite a UTF-8 text file inside /workspace.",
            inputSchema: z.object({
                path: z.string().min(1).max(1_000),
                content: z.string().max(256_000),
            }),
        },
        ({ path, content }) =>
            run("container_file_write", async (target) => {
                const resolved = workspacePath(path);
                const parent = resolved.slice(0, resolved.lastIndexOf("/"));
                if (parent !== "/workspace") {
                    await target.mkdir(parent, { recursive: true });
                }
                await target.writeFile(resolved, content);
                return textResult(`Wrote ${resolved}.`);
            }),
    );

    server.registerTool(
        "container_file_read",
        {
            description: "Read a UTF-8 text file inside /workspace.",
            inputSchema: z.object({ path: z.string().min(1).max(1_000) }),
        },
        ({ path }) =>
            run("container_file_read", async (target) => {
                const resolved = workspacePath(path);
                const file = await target.readFile(resolved, {
                    encoding: "utf-8",
                });
                return textResult(file.content);
            }),
    );

    server.registerTool(
        "container_files_list",
        {
            description: "List files and directories inside /workspace.",
            inputSchema: z.object({
                path: z.string().min(1).max(1_000).optional(),
            }),
        },
        ({ path }) =>
            run("container_files_list", async (target) => {
                const files = await target.listFiles(workspacePath(path));
                return textResult(JSON.stringify(files, null, 2));
            }),
    );

    server.registerTool(
        "container_file_delete",
        {
            description: "Delete a file inside /workspace.",
            inputSchema: z.object({ path: z.string().min(1).max(1_000) }),
        },
        ({ path }) =>
            run("container_file_delete", async (target) => {
                const resolved = workspacePath(path);
                await target.deleteFile(resolved);
                return textResult(`Deleted ${resolved}.`);
            }),
    );

    return server;
}

export function createWorker({ getSandboxImpl }) {
    return {
        async fetch(request, env) {
            if (new URL(request.url).pathname !== "/") {
                return new Response("Not found", { status: 404 });
            }
            const callerId = request.headers.get(MCP_CALLER_ID_HEADER);
            if (!callerId) {
                return new Response("Missing trusted caller identity", {
                    status: 401,
                });
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
                    buildServer(
                        env,
                        callerId,
                        getSandboxImpl,
                        (reportedUsage) => {
                            usage = reportedUsage;
                        },
                    ),
                { onerror: (error) => console.error(error) },
            );
            const response = await handler.fetch(request);
            const body = await response.arrayBuffer();
            return withMcpUsageHeaders(new Response(body, response), usage);
        },
    };
}
