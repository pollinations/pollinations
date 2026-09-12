import { DurableObject } from "cloudflare:workers";
import {
    type DurableObjectStorageLike,
    getWorkspace,
    type WorkspaceClient,
    WorkspaceServiceProxy,
    withWorkspace,
} from "@cloudflare/computer";
import { WorkerShellBackend } from "@cloudflare/computer/backends/worker-shell";
import jqModules from "@cloudflare/computer/shell/jq";
import sqliteModules from "@cloudflare/computer/shell/sqlite";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { withMcpUsageHeaders } from "../../../shared/mcp-usage.ts";
import {
    COMPUTER_TOOL_CALL_PRICE,
    MCP_USER_ID_HEADER,
} from "../../../shared/registry/mcp.ts";
import { createComputerMcpServer } from "./server.ts";

const TOOL_CALL_RATE = "computer.tool_call.v1";

type Env = {
    COMPUTER: DurableObjectNamespace<Computer>;
    LOADER: WorkerLoader;
};

const README_PATH = "/workspace/README.md";
const README = `# Your computer

This is your private, persistent computer. Everything under /workspace
survives between runs. Nothing outside /workspace persists.

## Memory convention

- /workspace/memory/facts.md — current facts about the user and the work.
  Edit in place when something changes; keep it short.
- /workspace/memory/log/YYYY-MM-DD.md — append-only journal. Add a dated
  entry at the end of each run: what happened, what was decided, open items.
- Before answering questions about earlier work, grep /workspace/memory.

## Tools

read, write, edit, ls, find, grep operate on the filesystem. exec runs
bash (no network, no Node, no Python; jq and sqlite3 are available).
`;

// The Dynamic Worker running bash reaches this filesystem through the
// service proxy, so the loader loopback needs the class exported here.
export { WorkspaceServiceProxy };

export class Computer extends withWorkspace(
    class extends DurableObject<Env> {},
    (self) => {
        const { ctx, env } = self as unknown as {
            ctx: DurableObjectState;
            env: Env;
        };
        return {
            storage: ctx.storage as unknown as DurableObjectStorageLike,
            backends: [
                new WorkerShellBackend({
                    loader: env.LOADER,
                    workspace: { binding: "COMPUTER", id: ctx.id.toString() },
                    ctx,
                    egress: { mode: "none" },
                    commands: [jqModules, sqliteModules],
                }),
            ],
        };
    },
) {
    override async fetch(request: Request): Promise<Response> {
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
        const response = await transport.handleRequest(request, {
            parsedBody: payload,
        });
        return withMcpUsageHeaders(response, toolCallUsage(payload, response));
    }
}

type JsonRpcPayload = {
    method?: string;
    params?: { name?: string };
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
        await workspace.fs.mkdir("/workspace/memory/log", { recursive: true });
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
        const stub = env.COMPUTER.get(env.COMPUTER.idFromName(userId));
        return stub.fetch(request);
    },
} satisfies ExportedHandler<Env>;
