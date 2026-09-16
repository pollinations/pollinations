import { DurableObject } from "cloudflare:workers";
import {
    type DurableObjectStorageLike,
    getWorkspace,
    type WorkspaceClient,
    type WorkspaceOptions,
    WorkspaceProxy,
    withWorkspace,
} from "@cloudflare/computer";
import type { WorkspaceLike } from "@cloudflare/computer/assets";
import {
    CloudflareContainerBackend,
    withWorkspaceContainer,
} from "@cloudflare/computer/backends/container";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { withMcpUsageHeaders } from "../../../shared/mcp-usage.ts";
import {
    COMPUTER_TOOL_CALL_PRICE,
    MCP_AGENT_ID_HEADER,
    MCP_USAGE_HEADERS,
    MCP_USER_ID_HEADER,
} from "../../../shared/registry/mcp.ts";
import { createMediaAssets, type MediaService } from "./assets.ts";
import {
    createComputerMcpServer,
    DEFAULT_WORKSPACE,
    HOME,
    WORKSPACE_NAME_PATTERN,
} from "./server.ts";

const TOOL_CALL_RATE = "computer.tool_call.v1";
const PORT_REQUEST_RATE = "computer.port_request.v1";
const SSH_SESSION_RATE = "computer.ssh_session.v1";
const IDLE_TIMEOUT_MS = 5 * 60_000;
const SERVER_START_TIMEOUT_MS = 20_000;
const SSH_SESSION_LIMIT_MS = 60 * 60_000;
const SSH_PORT = 2222;
// computerd's RPC port and sshd are never proxied as HTTP ports.
const RESERVED_PORTS = new Set([8080, SSH_PORT]);
const START_SCRIPT = `${HOME}/start.sh`;

// Routes the container's workspace RPC connection back to its Durable Object.
export { WorkspaceProxy };

type Env = {
    COMPUTER: DurableObjectNamespace<Computer>;
    MEDIA: MediaService;
};

const README_PATH = `${HOME}/README.md`;
const README = `# Your computer

This is one of your private, persistent workspaces. Everything under
/workspace survives between runs. Use a separate workspace name for an
unrelated project; "default" is used when no name is given.

## Memory convention

- /workspace/memory/facts.md — current facts about the user and the work.
  Edit in place when something changes; keep it short.
- /workspace/memory/log/YYYY-MM-DD.md — append-only journal. Add a dated
  entry at the end of each run: what happened, what was decided, open items.
- Before answering questions about earlier work, grep /workspace/memory.

## Shell

The bash tool runs in Debian with Node.js, npm, apt, git, native binaries and
outbound network. The container starts on the first command and stops after
five minutes without commands. Only
/workspace survives a container restart. Write a file by passing its content
as stdin to \`cat > path\`. Commands start in /workspace; use \`cd\` inside a
command when needed.

## Serving and SSH

- A server listening on a port is reachable by the owner at
  https://gen.pollinations.ai/computer/<workspace>/ports/<port>/ with their
  key. Put its start command in /workspace/start.sh; it runs when a request
  finds the port closed.
- For SSH, add the owner's public key to /workspace/.ssh/authorized_keys.

## Importing and sharing

- In: \`curl -o path <url>\` for any public URL; \`git clone <https-url>\`
  for any public repository.
- Out: the \`publish_file\` tool copies one file from /workspace to public
  media storage and prints an unlisted URL that stays valid 30 days; tar a
  folder first.
  For anything the user wants to keep, \`git push\` to a repository they
  own: they give you a token scoped to that one repository and you put it
  in the remote URL (https://x:TOKEN@github.com/user/repo.git). The token
  is stored in this computer's git config, nowhere else.
`;

class ComputerBase extends withWorkspaceContainer(
    class extends DurableObject<Env> {},
) {
    readonly containerShell = new CloudflareContainerBackend({
        container: () => this,
        workspace: { binding: "COMPUTER", id: this.ctx.id.toString() },
        egress: { mode: "direct" },
    });
}

function workspaceOptions(
    self: InstanceType<typeof ComputerBase>,
): WorkspaceOptions {
    const { ctx, env } = self as unknown as {
        ctx: DurableObjectState;
        env: Env;
    };
    return {
        storage: ctx.storage as unknown as DurableObjectStorageLike,
        // Typed as unknown: comparing Workspace to WorkspaceLike makes tsc
        // recurse through the fs overloads until it gives up.
        assets: (workspace: unknown) =>
            createMediaAssets(workspace as WorkspaceLike, env.MEDIA),
        backends: [self.containerShell],
    };
}

export class Computer extends withWorkspace(ComputerBase, workspaceOptions) {
    private activeCommands = 0;

    async alarm(): Promise<void> {
        if (this.activeCommands > 0) {
            await this.ctx.storage.setAlarm(Date.now() + IDLE_TIMEOUT_MS);
            return;
        }
        await this.ctx.container?.destroy();
    }

    override async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        if (url.pathname === "/api") {
            return this.containerShell.handleFetch(request);
        }
        const route = parseRoute(url.pathname);
        if (route?.kind === "port") {
            return this.proxyPort(request, route.port, route.path + url.search);
        }
        if (route?.kind === "ssh") {
            return this.openSsh(request);
        }
        if (request.method !== "POST") {
            return new Response("Method Not Allowed", { status: 405 });
        }
        const payload = await readJsonRpc(request);
        const workspace = await getWorkspace(this);
        await seedReadme(workspace);
        const server = createComputerMcpServer(workspace);
        // JSON responses (not SSE) so the usage receipt can be attached once
        // the tool has finished.
        const transport = new WebStandardStreamableHTTPServerTransport({
            enableJsonResponse: true,
        });
        await server.connect(transport);
        const runsCommand =
            payload.method === "tools/call" && payload.params?.name === "bash";
        if (runsCommand) {
            this.activeCommands++;
            await this.ctx.storage.setAlarm(Date.now() + IDLE_TIMEOUT_MS);
        }
        try {
            const response = await transport.handleRequest(request, {
                parsedBody: payload,
            });
            return withMcpUsageHeaders(
                response,
                toolCallUsage(payload, response),
            );
        } finally {
            if (runsCommand) {
                this.activeCommands--;
                await this.ctx.storage.setAlarm(Date.now() + IDLE_TIMEOUT_MS);
            }
        }
    }

    // Keeps the container alive until the response headers arrive; the idle
    // alarm then restarts from that moment.
    private async hold<T>(work: () => Promise<T>): Promise<T> {
        this.activeCommands++;
        await this.ctx.storage.setAlarm(Date.now() + IDLE_TIMEOUT_MS);
        try {
            return await work();
        } finally {
            await this.release();
        }
    }

    private async release(): Promise<void> {
        this.activeCommands--;
        await this.ctx.storage.setAlarm(Date.now() + IDLE_TIMEOUT_MS);
    }

    // Boots the container through the workspace backend, so computerd has
    // mounted /workspace before anything else runs in it.
    private async ensureContainer(): Promise<void> {
        if (this.ctx.container?.running) return;
        const workspace = await getWorkspace(this);
        const run = await workspace.runtime.exec("true", { cwd: HOME });
        await run.result();
    }

    private async proxyPort(
        request: Request,
        port: number,
        path: string,
    ): Promise<Response> {
        // Buffered so the request can be replayed after start.sh brings the
        // server up.
        const body =
            request.method === "GET" || request.method === "HEAD"
                ? undefined
                : await request.arrayBuffer();
        const forward = () =>
            new Request(new URL(path, "http://localhost"), {
                method: request.method,
                headers: request.headers,
                body,
                redirect: "manual",
            });
        const response = await this.hold(async () => {
            await this.ensureContainer();
            const container = this.getWorkspaceContainer();
            try {
                return await container.fetchPort(port, forward());
            } catch {
                // Nothing listens yet: start the owner's server and retry.
            }
            await this.startServer();
            const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
            for (;;) {
                try {
                    return await container.fetchPort(port, forward());
                } catch (error) {
                    if (Date.now() > deadline) {
                        return Response.json(
                            {
                                error: `Nothing is listening on port ${port}. Start a server there, or add ${START_SCRIPT}.`,
                                detail:
                                    error instanceof Error
                                        ? error.message
                                        : String(error),
                            },
                            { status: 502 },
                        );
                    }
                    await scheduler.wait(500);
                }
            }
        });
        // A server in the container must not be able to write its own receipt.
        const result = new Response(response.body, response);
        for (const header of Object.values(MCP_USAGE_HEADERS)) {
            result.headers.delete(header);
        }
        return withMcpUsageHeaders(result, {
            cost: COMPUTER_TOOL_CALL_PRICE,
            tool: "port",
            status: response.status,
            adjustmentId: PORT_REQUEST_RATE,
            adjustmentUnits: 1,
        });
    }

    private async startServer(): Promise<void> {
        const process = await this.ctx.container?.exec(
            [
                "sh",
                "-c",
                `test -f ${START_SCRIPT} && (nohup sh ${START_SCRIPT} >> ${HOME}/.start.log 2>&1 &)`,
            ],
            { cwd: HOME, stdout: "ignore", stderr: "ignore" },
        );
        await process?.exitCode;
    }

    private async openSsh(request: Request): Promise<Response> {
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
            return new Response("Expected a WebSocket upgrade", {
                status: 426,
            });
        }
        this.activeCommands++;
        await this.ctx.storage.setAlarm(Date.now() + IDLE_TIMEOUT_MS);
        let socket: Socket;
        try {
            await this.ensureContainer();
            socket = this.getWorkspaceContainer()
                .port(SSH_PORT)
                .connect(`localhost:${SSH_PORT}`);
            await socket.opened;
        } catch (error) {
            await this.release();
            return Response.json(
                {
                    error: "SSH is not reachable",
                    detail:
                        error instanceof Error ? error.message : String(error),
                },
                { status: 502 },
            );
        }
        const [client, server] = Object.values(new WebSocketPair());
        server.accept();
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            clearTimeout(limit);
            server.close();
            void socket.close().catch(() => undefined);
            this.ctx.waitUntil(this.release());
        };
        const limit = setTimeout(close, SSH_SESSION_LIMIT_MS);
        const writer = socket.writable.getWriter();
        // Frames can arrive as a Blob, so writes are chained to keep order.
        let writes = Promise.resolve();
        server.addEventListener("message", (event) => {
            writes = writes
                .then(async () =>
                    writer.write(
                        typeof event.data === "string"
                            ? new TextEncoder().encode(event.data)
                            : event.data instanceof Blob
                              ? new Uint8Array(await event.data.arrayBuffer())
                              : new Uint8Array(event.data),
                    ),
                )
                .catch(close);
        });
        server.addEventListener("close", close);
        server.addEventListener("error", close);
        this.ctx.waitUntil(
            socket.readable
                .pipeTo(
                    new WritableStream({
                        write: (chunk) => server.send(chunk),
                    }),
                )
                .catch(() => undefined)
                .finally(close),
        );
        return withMcpUsageHeaders(
            new Response(null, { status: 101, webSocket: client }),
            {
                cost: COMPUTER_TOOL_CALL_PRICE,
                tool: "ssh",
                status: 101,
                adjustmentId: SSH_SESSION_RATE,
                adjustmentUnits: 1,
            },
        );
    }
}

type Route =
    | { kind: "port"; workspace: string; port: number; path: string }
    | { kind: "ssh"; workspace: string };

// /workspaces/<name>/ports/<port>/<path> and /workspaces/<name>/ssh
function parseRoute(pathname: string): Route | undefined {
    const match = pathname.match(
        /^\/workspaces\/([^/]+)\/(?:ports\/(\d{1,5})(\/.*)?|(ssh))$/,
    );
    if (!match || !WORKSPACE_NAME_PATTERN.test(match[1])) return undefined;
    if (match[4]) return { kind: "ssh", workspace: match[1] };
    const port = Number(match[2]);
    if (port < 1024 || port > 65535 || RESERVED_PORTS.has(port)) {
        return undefined;
    }
    return {
        kind: "port",
        workspace: match[1],
        port,
        path: match[3] ?? "/",
    };
}

type JsonRpcPayload = {
    id?: string | number | null;
    method?: string;
    params?: {
        name?: string;
        arguments?: { workspace?: unknown };
    };
};

async function readJsonRpc(request: Request): Promise<JsonRpcPayload> {
    try {
        return (await request.clone().json()) as JsonRpcPayload;
    } catch {
        return {};
    }
}

// Flat rate per successful tool call; discovery requests are free.
function toolCallUsage(payload: JsonRpcPayload, response: Response) {
    if (payload.method !== "tools/call" || !response.ok) return undefined;
    return {
        cost: COMPUTER_TOOL_CALL_PRICE,
        tool: payload.params?.name ?? "unknown",
        status: response.status,
        adjustmentId: TOOL_CALL_RATE,
        adjustmentUnits: 1,
    };
}

async function seedReadme(workspace: WorkspaceClient): Promise<void> {
    try {
        await workspace.fs.stat(README_PATH);
    } catch {
        await workspace.fs.mkdir(`${HOME}/memory/log`, { recursive: true });
        await workspace.fs.writeFile(README_PATH, README);
    }
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        if (url.pathname === "/health") {
            return new Response("ok\n");
        }
        const userId = request.headers.get(MCP_USER_ID_HEADER);
        if (!userId) {
            return Response.json(
                { error: "Missing Pollinations user" },
                { status: 401 },
            );
        }
        const managedAgentId = request.headers.get(MCP_AGENT_ID_HEADER);
        const route = parseRoute(url.pathname);
        if (!route && url.pathname !== "/") {
            return Response.json({ error: "Not found" }, { status: 404 });
        }
        const workspaceName =
            route?.workspace ?? requestedWorkspace(await readJsonRpc(request));
        // Managed agents get one computer installation per caller and agent.
        // Direct MCP use remains one computer per caller and workspace.
        const stub = env.COMPUTER.get(
            env.COMPUTER.idFromName(
                computerName(userId, managedAgentId, workspaceName),
            ),
        );
        return stub.fetch(request);
    },
} satisfies ExportedHandler<Env>;

function computerName(
    userId: string,
    managedAgentId: string | null,
    workspaceName: string,
): string {
    const owner = managedAgentId
        ? `user:${userId}:agent:${managedAgentId}`
        : `user:${userId}`;
    return `${owner}:workspace:${workspaceName}`;
}

function requestedWorkspace(payload: JsonRpcPayload): string {
    const value = payload.params?.arguments?.workspace;
    return payload.method === "tools/call" &&
        (payload.params?.name === "bash" ||
            payload.params?.name === "publish_file") &&
        typeof value === "string" &&
        WORKSPACE_NAME_PATTERN.test(value)
        ? value
        : DEFAULT_WORKSPACE;
}
