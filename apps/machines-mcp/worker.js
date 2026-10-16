import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { CommandExitError, Sandbox } from "e2b";
import { z } from "zod";
import { requireApiKey } from "../../packages/mcp/src/utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

function buildServer() {
    const server = new McpServer(
        { name: "machines-mcp", title: "Machines MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    const sandboxOpts = (context) => {
        requireApiKey(context);
        return {
            apiKey: context.http.authInfo.token,
            apiUrl: buildUrl("/alpha/e2b"),
        };
    };
    const id = z
        .string()
        .describe("Sandbox id from sandbox_create or sandbox_list");
    const json = (value) => createMCPResponse([createTextContent(value, true)]);
    const register = (name, description, inputSchema, run) =>
        server.registerTool(
            name,
            { description, inputSchema },
            async (args, context) =>
                json(await run(args, sandboxOpts(context))),
        );

    register(
        "sandbox_list",
        "List your sandboxes with their state (running or paused).",
        z.object({}),
        async (_args, opts) =>
            (await Sandbox.list(opts).nextItems()).map((s) => ({
                id: s.sandboxId,
                template: s.name ?? s.templateId,
                state: s.state,
                endAt: s.endAt,
            })),
    );
    register(
        "sandbox_create",
        "Start a real Linux sandbox. It is billed per hour from your Pollen until paused or killed, so kill it when done.",
        z.object({
            template: z
                .enum(["pollinations", "pollinations-large"])
                .default("pollinations")
                .describe("pollinations-large has 4 vCPU and 8 GB memory"),
            timeoutSeconds: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Pause the sandbox after this long; default 300"),
        }),
        async ({ template, timeoutSeconds }, opts) => ({
            id: (
                await Sandbox.create(template, {
                    ...opts,
                    timeoutMs: timeoutSeconds && timeoutSeconds * 1000,
                })
            ).sandboxId,
        }),
    );
    register(
        "sandbox_run",
        "Run a shell command in a sandbox and return its exit code, stdout and stderr. A paused sandbox is resumed first.",
        z.object({
            id,
            command: z.string(),
            cwd: z.string().optional(),
            timeoutSeconds: z.number().int().positive().default(60),
        }),
        async ({ id, command, cwd, timeoutSeconds }, opts) => {
            const sandbox = await Sandbox.connect(id, opts);
            try {
                const { exitCode, stdout, stderr } = await sandbox.commands.run(
                    command,
                    { cwd, timeoutMs: timeoutSeconds * 1000 },
                );
                return { exitCode, stdout, stderr };
            } catch (error) {
                if (!(error instanceof CommandExitError)) throw error;
                const { exitCode, stdout, stderr } = error;
                return { exitCode, stdout, stderr };
            }
        },
    );
    register(
        "sandbox_read_file",
        "Read a text file from a sandbox. A paused sandbox is resumed first.",
        z.object({ id, path: z.string() }),
        async ({ id, path }, opts) =>
            (await Sandbox.connect(id, opts)).files.read(path),
    );
    register(
        "sandbox_write_file",
        "Write a text file in a sandbox, creating parent directories. A paused sandbox is resumed first.",
        z.object({ id, path: z.string(), content: z.string() }),
        async ({ id, path, content }, opts) => {
            await (await Sandbox.connect(id, opts)).files.write(path, content);
            return { written: path };
        },
    );
    register(
        "sandbox_pause",
        "Pause a sandbox, keeping its files and memory. Billing stops; run a command or read a file to resume it.",
        z.object({ id }),
        async ({ id }, opts) => ({ paused: await Sandbox.pause(id, opts) }),
    );
    register(
        "sandbox_kill",
        "Delete a sandbox and everything in it.",
        z.object({ id }),
        async ({ id }, opts) => ({ killed: await Sandbox.kill(id, opts) }),
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
