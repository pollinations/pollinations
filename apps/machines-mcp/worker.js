import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { CommandExitError } from "e2b";
import { z } from "zod";

const DEFAULT_BASE_URL = "https://gen.pollinations.ai";
// Gen serves E2B's control API under this path with the caller's key: it
// checks the key's machines permission and bills every lease it starts.
const E2B_PATH = "/alpha/e2b";
// The template gen signs the caller into; the template also sets the size.
const DEFAULT_TEMPLATE = "pollinations";

function textContent(text) {
    return { content: [{ type: "text", text }] };
}

function jsonContent(value) {
    return textContent(JSON.stringify(value, null, 2));
}

function formatCommand({ exitCode, stdout, stderr }) {
    const output = [`exit code: ${exitCode}`];
    if (stdout) output.push(`stdout:\n${stdout.replace(/\n$/, "")}`);
    if (stderr) output.push(`stderr:\n${stderr.replace(/\n$/, "")}`);
    return output.join("\n");
}

function buildServer({ Sandbox, options }) {
    const server = new McpServer(
        { name: "pollinations-machines-mcp", version: "0.1.0" },
        {
            instructions:
                "Start, use, and stop Linux sandboxes. A sandbox bills your Pollen while it runs, so pause or kill the ones you are done with.",
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        "list_sandboxes",
        {
            description:
                "List your sandboxes with their state, size, and expiry.",
            inputSchema: z.object({}),
        },
        async () => {
            const sandboxes = await Sandbox.list(options).nextItems();
            return jsonContent(
                sandboxes.map(
                    ({
                        sandboxId,
                        templateId,
                        state,
                        startedAt,
                        endAt,
                        cpuCount,
                        memoryMB,
                    }) => ({
                        sandboxId,
                        templateId,
                        state,
                        startedAt,
                        endAt,
                        cpuCount,
                        memoryMB,
                    }),
                ),
            );
        },
    );

    server.registerTool(
        "create_sandbox",
        {
            description: `Start a new sandbox and return its ID. Defaults to the "${DEFAULT_TEMPLATE}" template.`,
            inputSchema: z.object({
                template: z
                    .string()
                    .optional()
                    .describe(
                        `Template to start: "${DEFAULT_TEMPLATE}" (2 vCPU, 2 GB) or "pollinations-large" (4 vCPU, 8 GB).`,
                    ),
                timeoutMs: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe(
                        "Lease in milliseconds. A longer lease keeps the sandbox running and billed until you pause or kill it.",
                    ),
            }),
        },
        async ({ template, timeoutMs }) => {
            const sandbox = await Sandbox.create(template ?? DEFAULT_TEMPLATE, {
                ...options,
                ...(timeoutMs === undefined ? {} : { timeoutMs }),
            });
            return jsonContent({ sandboxId: sandbox.sandboxId });
        },
    );

    server.registerTool(
        "run_command",
        {
            description:
                "Run a shell command in a sandbox and return its exit code, stdout, and stderr. Resumes a paused sandbox.",
            inputSchema: z.object({
                sandboxId: z.string().min(1),
                command: z.string().min(1),
                cwd: z
                    .string()
                    .optional()
                    .describe(
                        "Working directory. Defaults to the sandbox's home directory.",
                    ),
                timeoutMs: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe("Command timeout in milliseconds."),
            }),
        },
        async ({ sandboxId, command, cwd, timeoutMs }) => {
            const sandbox = await Sandbox.connect(sandboxId, options);
            try {
                return textContent(
                    formatCommand(
                        await sandbox.commands.run(command, {
                            ...(cwd === undefined ? {} : { cwd }),
                            ...(timeoutMs === undefined ? {} : { timeoutMs }),
                        }),
                    ),
                );
            } catch (error) {
                // A command that runs and exits non-zero is a result, not a
                // failed tool call.
                if (error instanceof CommandExitError) {
                    return textContent(formatCommand(error));
                }
                throw error;
            }
        },
    );

    server.registerTool(
        "read_file",
        {
            description:
                "Read a file from a sandbox as text. Resumes a paused sandbox.",
            inputSchema: z.object({
                sandboxId: z.string().min(1),
                path: z.string().min(1),
            }),
        },
        async ({ sandboxId, path }) => {
            const sandbox = await Sandbox.connect(sandboxId, options);
            return textContent(await sandbox.files.read(path));
        },
    );

    server.registerTool(
        "write_file",
        {
            description:
                "Write text to a file in a sandbox. Resumes a paused sandbox.",
            inputSchema: z.object({
                sandboxId: z.string().min(1),
                path: z.string().min(1),
                content: z.string(),
            }),
        },
        async ({ sandboxId, path, content }) => {
            const sandbox = await Sandbox.connect(sandboxId, options);
            await sandbox.files.write(path, content);
            return textContent(`Wrote ${path}.`);
        },
    );

    server.registerTool(
        "pause_sandbox",
        {
            description:
                "Pause a sandbox. It stops billing and resumes on the next run_command, read_file, or write_file.",
            inputSchema: z.object({ sandboxId: z.string().min(1) }),
        },
        async ({ sandboxId }) => {
            const paused = await Sandbox.pause(sandboxId, options);
            return textContent(
                paused
                    ? `Paused sandbox ${sandboxId}.`
                    : `Sandbox ${sandboxId} was already paused.`,
            );
        },
    );

    server.registerTool(
        "kill_sandbox",
        {
            description:
                "Kill a sandbox and delete its files. Pause it instead to keep it resumable.",
            inputSchema: z.object({ sandboxId: z.string().min(1) }),
        },
        async ({ sandboxId }) => {
            const killed = await Sandbox.kill(sandboxId, options);
            return textContent(
                killed
                    ? `Killed sandbox ${sandboxId}.`
                    : `Sandbox ${sandboxId} was not found.`,
            );
        },
    );

    return server;
}

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;

    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) {
        return null;
    }
    return token;
}

function unauthorizedResponse() {
    return Response.json(
        {
            error: "unauthorized",
            message: "Send a Pollinations API key as a bearer token.",
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

export function createWorker({ Sandbox }) {
    return {
        async fetch(request, env) {
            const url = new URL(request.url);

            if (url.pathname === "/health" && request.method === "GET") {
                return Response.json({
                    name: "pollinations-machines-mcp",
                    transport: "streamable-http",
                    endpoint: "/",
                    stateless: true,
                });
            }

            if (url.pathname !== "/") {
                return new Response("Not found", { status: 404 });
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

            const baseUrl = (
                env?.POLLINATIONS_BASE_URL || DEFAULT_BASE_URL
            ).replace(/\/+$/, "");
            const options = {
                apiKey: token,
                apiUrl: `${baseUrl}${E2B_PATH}`,
            };
            const handler = createMcpHandler(
                () => buildServer({ Sandbox, options }),
                {
                    legacy: "stateless",
                    onerror: (error) => console.error(error),
                },
            );
            return handler.fetch(request, {
                authInfo: {
                    token,
                    clientId: "pollinations-api-key",
                    scopes: [],
                },
            });
        },
    };
}
