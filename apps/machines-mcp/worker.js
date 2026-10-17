import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { CommandExitError, Sandbox } from "e2b";
import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

// Gen forwards E2B's control API; commands and files then talk to the
// sandbox directly with the tokens those responses carry.
const API_URL = buildUrl("/alpha/e2b");
const DEFAULT_TEMPLATE = "pollinations";

function sdk(context) {
    return { apiKey: context.http.authInfo.token, apiUrl: API_URL };
}

function result({ exitCode, stdout, stderr }) {
    return { exitCode, stdout, stderr };
}

function buildServer() {
    const server = new McpServer(
        { name: "machines-mcp", title: "Machines MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "sandbox_list",
        {
            description:
                "List your sandboxes with sandbox id, template, state (running or paused) and expiry.",
            inputSchema: z.object({}),
        },
        async (_args, context) => {
            const sandboxes = await Sandbox.list(sdk(context));
            return createMCPResponse([
                createTextContent(await sandboxes.nextItems(), true),
            ]);
        },
    );
    server.registerTool(
        "sandbox_create",
        {
            description:
                "Start a new sandbox and return its sandbox id. Templates: 'pollinations' (2 vCPU, default) and 'pollinations-large' (4 vCPU). The sandbox pauses itself when its timeout runs out.",
            inputSchema: z.object({
                template: z
                    .string()
                    .optional()
                    .describe("Sandbox template name."),
                timeoutMs: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe("Milliseconds until the sandbox pauses."),
            }),
        },
        async ({ template, timeoutMs }, context) => {
            const name = template ?? DEFAULT_TEMPLATE;
            const sandbox = await Sandbox.create(name, {
                ...sdk(context),
                ...(timeoutMs && { timeoutMs }),
            });
            return createMCPResponse([
                createTextContent(
                    { sandboxId: sandbox.sandboxId, template: name },
                    true,
                ),
            ]);
        },
    );
    server.registerTool(
        "sandbox_run",
        {
            description:
                "Run a shell command in a sandbox (resumes it first if paused) and return its exit code, stdout and stderr.",
            inputSchema: z.object({
                sandboxId: z.string().describe("Sandbox to run in."),
                command: z.string().describe("Shell command to run."),
                cwd: z.string().optional().describe("Working directory."),
            }),
        },
        async ({ sandboxId, command, cwd }, context) => {
            const sandbox = await Sandbox.connect(sandboxId, sdk(context));
            try {
                const done = await sandbox.commands.run(
                    command,
                    cwd ? { cwd } : {},
                );
                return createMCPResponse([
                    createTextContent(result(done), true),
                ]);
            } catch (error) {
                // A non-zero exit is the command's answer, not a failed tool.
                if (error instanceof CommandExitError) {
                    return createMCPResponse([
                        createTextContent(result(error), true),
                    ]);
                }
                throw error;
            }
        },
    );
    server.registerTool(
        "sandbox_read_file",
        {
            description: "Read a file from a sandbox as text.",
            inputSchema: z.object({
                sandboxId: z.string().describe("Sandbox to read from."),
                path: z.string().describe("Absolute file path."),
            }),
        },
        async ({ sandboxId, path }, context) => {
            const sandbox = await Sandbox.connect(sandboxId, sdk(context));
            return createMCPResponse([
                createTextContent(await sandbox.files.read(path)),
            ]);
        },
    );
    server.registerTool(
        "sandbox_write_file",
        {
            description:
                "Write a text file in a sandbox, creating parent directories as needed.",
            inputSchema: z.object({
                sandboxId: z.string().describe("Sandbox to write to."),
                path: z.string().describe("Absolute file path."),
                content: z.string().describe("File content."),
            }),
        },
        async ({ sandboxId, path, content }, context) => {
            const sandbox = await Sandbox.connect(sandboxId, sdk(context));
            const info = await sandbox.files.write(path, content);
            return createMCPResponse([createTextContent(info, true)]);
        },
    );
    server.registerTool(
        "sandbox_pause",
        {
            description:
                "Pause a sandbox; a later sandbox_run on it resumes it.",
            inputSchema: z.object({
                sandboxId: z.string().describe("Sandbox to pause."),
            }),
        },
        async ({ sandboxId }, context) => {
            const paused = await Sandbox.pause(sandboxId, sdk(context));
            return createMCPResponse([
                createTextContent({ sandboxId, paused }, true),
            ]);
        },
    );
    server.registerTool(
        "sandbox_kill",
        {
            description:
                "Permanently kill a sandbox. Do this when you are done with it.",
            inputSchema: z.object({
                sandboxId: z.string().describe("Sandbox to kill."),
            }),
        },
        async ({ sandboxId }, context) => {
            const killed = await Sandbox.kill(sandboxId, sdk(context));
            return createMCPResponse([
                createTextContent({ sandboxId, killed }, true),
            ]);
        },
    );
    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

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

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "machines-mcp",
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

        return mcpHandler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
