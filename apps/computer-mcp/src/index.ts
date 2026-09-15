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
const IDLE_TIMEOUT_MS = 5 * 60_000;

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
        if (new URL(request.url).pathname === "/api") {
            return this.containerShell.handleFetch(request);
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
        const workspaceName = requestedWorkspace(await readJsonRpc(request));
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
