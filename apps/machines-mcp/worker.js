import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { CommandExitError, Sandbox } from "e2b";
import * as z from "zod";

const GEN =
    process.env.POLLINATIONS_BASE_URL?.trim() || "https://gen.pollinations.ai";
const OUTPUT_LIMIT = 100_000;

// These become part of API paths and request bodies, so keep them plain.
const sandboxId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const template = z.string().regex(/^[A-Za-z0-9._/-]{1,100}$/);
const path = z.string().min(1).max(1000);

const asText = (value, isError = false) => ({
    ...(isError && { isError }),
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

const cut = (text) =>
    text.length > OUTPUT_LIMIT
        ? `${text.slice(0, OUTPUT_LIMIT)}\n[cut at ${OUTPUT_LIMIT} characters]`
        : text;

// E2B's SDK talks to gen's /alpha/e2b with the caller's own key, so gen enforces
// the `machines` permission and bills the caller's Pollen.
const apiOptions = (context) => ({
    apiKey: context.http.authInfo.token,
    apiUrl: `${GEN}/alpha/e2b`,
});

export function buildServer(sdk = Sandbox) {
    const server = new McpServer(
        { name: "machines-mcp", title: "Machines MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "sandbox_list",
        {
            description:
                "List your sandboxes, running and paused: id, name, template, state, size and when the current paid time ends.",
            inputSchema: z.object({}),
        },
        async (_args, context) => {
            const sandboxes = await sdk.list(apiOptions(context)).nextItems();
            return asText(
                sandboxes.map((sandbox) => ({
                    sandboxId: sandbox.sandboxId,
                    name: sandbox.metadata?.name ?? null,
                    template: sandbox.name ?? sandbox.templateId,
                    state: sandbox.state,
                    cpuCount: sandbox.cpuCount,
                    memoryMB: sandbox.memoryMB,
                    endAt: sandbox.endAt,
                })),
            );
        },
    );

    server.registerTool(
        "sandbox_create",
        {
            description:
                "Start a new sandbox: a real Linux machine. The default template `pollinations` has 2 vCPU, 2 GB memory and Node.js, Python and git. It is paid from your Pollen while it runs (about 0.033 Pollen an hour); pause or kill it when you are done.",
            inputSchema: z.object({
                template: template.default("pollinations"),
                name: z.string().min(1).max(60).optional(),
                timeoutSeconds: z
                    .number()
                    .int()
                    .min(60)
                    .max(86_400)
                    .default(600),
            }),
        },
        async ({ template, name, timeoutSeconds }, context) => {
            const sandbox = await sdk.create(template, {
                ...apiOptions(context),
                timeoutMs: timeoutSeconds * 1000,
                ...(name && { metadata: { name } }),
            });
            return asText({
                sandboxId: sandbox.sandboxId,
                template,
                timeoutSeconds,
            });
        },
    );

    server.registerTool(
        "sandbox_run",
        {
            description:
                "Run a shell command in a sandbox and return its exit code, stdout and stderr. A paused sandbox is resumed first. A non-zero exit code is returned as a tool error with the output.",
            inputSchema: z.object({
                sandboxId,
                command: z.string().min(1).max(100_000),
                cwd: path.optional(),
                timeoutSeconds: z.number().int().min(1).max(600).default(60),
            }),
        },
        async ({ sandboxId, command, cwd, timeoutSeconds }, context) => {
            const sandbox = await sdk.connect(sandboxId, apiOptions(context));
            try {
                const result = await sandbox.commands.run(command, {
                    ...(cwd && { cwd }),
                    timeoutMs: timeoutSeconds * 1000,
                });
                return asText({
                    exitCode: result.exitCode,
                    stdout: cut(result.stdout),
                    stderr: cut(result.stderr),
                });
            } catch (error) {
                if (!(error instanceof CommandExitError)) throw error;
                return asText(
                    {
                        exitCode: error.exitCode,
                        stdout: cut(error.stdout),
                        stderr: cut(error.stderr),
                    },
                    true,
                );
            }
        },
    );

    server.registerTool(
        "sandbox_read_file",
        {
            description:
                "Read a text file from a sandbox (cut at 100000 characters). A paused sandbox is resumed first.",
            inputSchema: z.object({ sandboxId, path }),
        },
        async ({ sandboxId, path }, context) => {
            const sandbox = await sdk.connect(sandboxId, apiOptions(context));
            return asText({
                path,
                content: cut(await sandbox.files.read(path)),
            });
        },
    );

    server.registerTool(
        "sandbox_write_file",
        {
            description:
                "Write a text file in a sandbox, creating folders as needed and replacing an existing file. A paused sandbox is resumed first.",
            inputSchema: z.object({
                sandboxId,
                path,
                content: z.string().max(5_000_000),
            }),
        },
        async ({ sandboxId, path, content }, context) => {
            const sandbox = await sdk.connect(sandboxId, apiOptions(context));
            await sandbox.files.write(path, content);
            return asText({
                path,
                bytes: new TextEncoder().encode(content).length,
            });
        },
    );

    server.registerTool(
        "sandbox_pause",
        {
            description:
                "Pause a sandbox. Its files and memory stay, nothing is billed, and the next run or file call resumes it.",
            inputSchema: z.object({ sandboxId }),
        },
        async ({ sandboxId }, context) => {
            await sdk.pause(sandboxId, apiOptions(context));
            return asText({ sandboxId, state: "paused" });
        },
    );

    server.registerTool(
        "sandbox_kill",
        {
            description: "Delete a sandbox and its files for good.",
            inputSchema: z.object({ sandboxId }),
        },
        async ({ sandboxId }, context) => {
            const found = await sdk.kill(sandboxId, apiOptions(context));
            return found
                ? asText({ sandboxId, killed: true })
                : asText(`No sandbox ${sandboxId}.`, true);
        },
    );

    return server;
}

function readBearerToken(request) {
    const [scheme, token] = (request.headers.get("authorization") ?? "")
        .trim()
        .split(/\s+/, 2);
    return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

/** The Worker. Tests pass a fake `sdk`; production uses E2B's Sandbox. */
export function makeWorker(sdk = Sandbox) {
    const mcpHandler = createMcpHandler(() => buildServer(sdk), {
        legacy: "stateless",
        onerror: (error) => console.error(error),
    });

    return {
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
            if (!token) {
                return Response.json(
                    {
                        error: "unauthorized",
                        message:
                            "Send a Pollinations API key as a bearer token.",
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
}

export default makeWorker();
