import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { CommandExitError, Sandbox } from "e2b";
import { z } from "zod";

const DEFAULT_BASE_URL = "https://gen.pollinations.ai";
const DEFAULT_TEMPLATE = "pollinations";
const KEEP_SECONDS = 2 ** 31 - 1;
const OUTPUT_LIMIT = 100_000;

const cut = (text) =>
    text.length > OUTPUT_LIMIT
        ? `${text.slice(0, OUTPUT_LIMIT)}\n[cut at ${OUTPUT_LIMIT} characters]`
        : text;

function resolveApiUrl(env) {
    const baseUrl = (
        env?.POLLINATIONS_BASE_URL?.trim() ||
        (typeof process !== "undefined"
            ? process.env?.POLLINATIONS_BASE_URL?.trim()
            : undefined) ||
        DEFAULT_BASE_URL
    ).replace(/\/+$/, "");
    return `${baseUrl}/alpha/e2b`;
}

function jsonResult(value, isError = false) {
    return {
        ...(isError && { isError }),
        content: [
            {
                type: "text",
                text: JSON.stringify(value, null, 2),
            },
        ],
    };
}

function toTimeoutMs(timeoutSeconds) {
    if (timeoutSeconds === undefined) return undefined;
    return (timeoutSeconds === 0 ? KEEP_SECONDS : timeoutSeconds) * 1000;
}

function buildServer(token, env) {
    const apiOpts = {
        apiKey: token,
        apiUrl: resolveApiUrl(env),
    };

    const server = new McpServer(
        { name: "pollinations-machines-mcp", version: "0.1.0" },
        {
            instructions:
                "Start and manage Pollinations Linux sandboxes powered by E2B. Create a sandbox with create_sandbox (defaults to the 'pollinations' template with Node.js 24, Python 3.11, polli, and coding harnesses), run commands with run_command, read and write files with read_file and write_file, pause idle sandboxes with pause_sandbox so they cost nothing while preserving files and memory, resume or extend timeouts with connect_sandbox, list sandboxes with list_sandboxes, and delete finished sandboxes with kill_sandbox.",
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        "create_sandbox",
        {
            title: "Create Sandbox",
            description:
                "Start a new Pollinations Linux sandbox. Defaults to the 'pollinations' template (2 vCPU, 2 GB RAM, 20 GB disk); use 'pollinations-large' for 4 vCPU, 8 GB RAM, and 50 GB disk.",
            inputSchema: z.object({
                template: z
                    .string()
                    .min(1)
                    .optional()
                    .describe(
                        "E2B template name or ID. Defaults to 'pollinations'.",
                    ),
                timeout: z
                    .number()
                    .int()
                    .min(0)
                    .optional()
                    .describe(
                        "Seconds to keep the sandbox running (0 keeps it running until paused or killed).",
                    ),
                name: z
                    .string()
                    .min(1)
                    .optional()
                    .describe("Optional sandbox name stored in metadata.name."),
                metadata: z
                    .record(z.string(), z.string())
                    .optional()
                    .describe("Optional key-value metadata for the sandbox."),
                envs: z
                    .record(z.string(), z.string())
                    .optional()
                    .describe(
                        "Optional default environment variables inside the sandbox.",
                    ),
            }),
        },
        async ({ template, timeout, name, metadata, envs }) => {
            const resolvedTemplate = template ?? DEFAULT_TEMPLATE;
            const mergedMetadata =
                name || metadata
                    ? { ...(metadata ?? {}), ...(name ? { name } : {}) }
                    : undefined;
            const timeoutMs = toTimeoutMs(timeout);
            const sandbox = await Sandbox.create(resolvedTemplate, {
                ...apiOpts,
                timeoutMs,
                metadata: mergedMetadata,
                envs,
            });
            return jsonResult({
                sandboxId: sandbox.sandboxId,
                template: resolvedTemplate,
                ...(mergedMetadata ? { metadata: mergedMetadata } : {}),
            });
        },
    );

    server.registerTool(
        "list_sandboxes",
        {
            title: "List Sandboxes",
            description: "List your running and paused sandboxes.",
            inputSchema: z.object({
                state: z
                    .array(z.enum(["running", "paused"]))
                    .min(1)
                    .optional()
                    .describe(
                        "Optional filter by state ('running', 'paused'). Defaults to both.",
                    ),
            }),
        },
        async ({ state }) => {
            const paginator = Sandbox.list({
                ...apiOpts,
                ...(state ? { query: { state } } : {}),
            });
            const sandboxes = [];
            while (paginator.hasNext) {
                sandboxes.push(...(await paginator.nextItems()));
            }
            return jsonResult(sandboxes);
        },
    );

    server.registerTool(
        "connect_sandbox",
        {
            title: "Connect Sandbox",
            description:
                "Connect to a sandbox by ID, resuming it if paused and optionally extending its timeout.",
            inputSchema: z.object({
                sandboxId: z.string().min(1).describe("Sandbox ID."),
                timeout: z
                    .number()
                    .int()
                    .min(0)
                    .optional()
                    .describe(
                        "Seconds from now to keep the sandbox running (0 keeps it running until paused or killed).",
                    ),
            }),
        },
        async ({ sandboxId, timeout }) => {
            const timeoutMs = toTimeoutMs(timeout);
            const sandbox = await Sandbox.connect(sandboxId, {
                ...apiOpts,
                timeoutMs,
            });
            return jsonResult({
                sandboxId: sandbox.sandboxId,
                connected: true,
                state: "running",
            });
        },
    );

    server.registerTool(
        "pause_sandbox",
        {
            title: "Pause Sandbox",
            description:
                "Pause a sandbox, preserving its files and memory at zero running cost until resumed.",
            inputSchema: z.object({
                sandboxId: z.string().min(1).describe("Sandbox ID."),
            }),
        },
        async ({ sandboxId }) => {
            const paused = await Sandbox.pause(sandboxId, apiOpts);
            return jsonResult({
                sandboxId,
                paused,
                state: "paused",
            });
        },
    );

    server.registerTool(
        "kill_sandbox",
        {
            title: "Kill Sandbox",
            description: "Permanently delete a sandbox and its files.",
            inputSchema: z.object({
                sandboxId: z.string().min(1).describe("Sandbox ID."),
            }),
        },
        async ({ sandboxId }) => {
            const killed = await Sandbox.kill(sandboxId, apiOpts);
            return jsonResult({
                sandboxId,
                killed,
            });
        },
    );

    server.registerTool(
        "run_command",
        {
            title: "Run Command",
            description:
                "Connect to a sandbox (resuming it if paused) and run a shell command. stdout and stderr are each cut at 100000 characters. For long commands, first use connect_sandbox to extend the paid lease; the command timeout does not extend it.",
            inputSchema: z.object({
                sandboxId: z.string().min(1).describe("Sandbox ID."),
                command: z
                    .string()
                    .min(1)
                    .describe("Shell command to execute."),
                cwd: z
                    .string()
                    .min(1)
                    .optional()
                    .describe("Working directory inside the sandbox."),
                user: z
                    .string()
                    .min(1)
                    .optional()
                    .describe("User to run the command as."),
                envs: z
                    .record(z.string(), z.string())
                    .optional()
                    .describe("Environment variables for this command."),
                timeoutMs: z
                    .number()
                    .int()
                    .min(0)
                    .optional()
                    .describe(
                        "Command timeout in milliseconds (0 disables the timeout).",
                    ),
            }),
        },
        async ({ sandboxId, command, cwd, user, envs, timeoutMs }) => {
            const sandbox = await Sandbox.connect(sandboxId, apiOpts);
            try {
                const result = await sandbox.commands.run(command, {
                    cwd,
                    user,
                    envs,
                    timeoutMs,
                });
                return jsonResult({
                    exitCode: result.exitCode,
                    stdout: cut(result.stdout),
                    stderr: cut(result.stderr),
                    ...(result.error ? { error: result.error } : {}),
                });
            } catch (error) {
                if (error instanceof CommandExitError) {
                    return jsonResult(
                        {
                            exitCode: error.exitCode,
                            stdout: cut(error.stdout),
                            stderr: cut(error.stderr),
                            ...(error.error ? { error: error.error } : {}),
                        },
                        true,
                    );
                }
                throw error;
            }
        },
    );

    server.registerTool(
        "write_file",
        {
            title: "Write File",
            description:
                "Connect to a sandbox (resuming it if paused) and write a text file, creating parent directories as needed.",
            inputSchema: z.object({
                sandboxId: z.string().min(1).describe("Sandbox ID."),
                path: z
                    .string()
                    .min(1)
                    .describe("Destination file path in the sandbox."),
                content: z.string().describe("UTF-8 text content to write."),
                user: z
                    .string()
                    .min(1)
                    .optional()
                    .describe(
                        "User for file ownership and relative path resolution.",
                    ),
            }),
        },
        async ({ sandboxId, path, content, user }) => {
            const sandbox = await Sandbox.connect(sandboxId, apiOpts);
            const info = await sandbox.files.write(path, content, { user });
            return jsonResult(info);
        },
    );

    server.registerTool(
        "read_file",
        {
            title: "Read File",
            description:
                "Connect to a sandbox (resuming it if paused) and read a text file, cut at 100000 characters. Use run_command with sed or tail to read another section of a larger file.",
            inputSchema: z.object({
                sandboxId: z.string().min(1).describe("Sandbox ID."),
                path: z
                    .string()
                    .min(1)
                    .describe("File path to read from the sandbox."),
                user: z
                    .string()
                    .min(1)
                    .optional()
                    .describe("User for relative path resolution."),
            }),
        },
        async ({ sandboxId, path, user }) => {
            const sandbox = await Sandbox.connect(sandboxId, apiOpts);
            const content = await sandbox.files.read(path, {
                format: "text",
                user,
            });
            return {
                content: [{ type: "text", text: cut(content) }],
            };
        },
    );

    return server;
}

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;

    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) return null;
    return token;
}

function unauthorizedResponse() {
    return Response.json(
        {
            error: "unauthorized",
            message:
                "Send your Pollinations API key as Authorization: Bearer <key>. Get one at https://enter.pollinations.ai",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate":
                    'Bearer realm="machines-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                status: "ok",
                service: "machines-mcp",
                endpoint: "/",
            });
        }

        if (url.pathname !== "/") {
            return Response.json(
                {
                    error: "not_found",
                    message: "The MCP endpoint is served at /.",
                },
                { status: 404 },
            );
        }

        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();

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

        const handler = createMcpHandler(() => buildServer(token, env), {
            legacy: "stateless",
            onerror: (error) => console.error(error),
        });

        return handler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
