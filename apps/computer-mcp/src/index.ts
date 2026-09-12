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
import { DurableObject } from "cloudflare:workers";
import { MCP_USER_ID_HEADER } from "../../../shared/registry/mcp.ts";
import { createComputerMcpServer } from "./server.ts";

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
        const workspace = await getWorkspace(this);
        await seedReadme(workspace);
        const server = createComputerMcpServer(workspace);
        const transport = new WebStandardStreamableHTTPServerTransport();
        await server.connect(transport);
        return transport.handleRequest(request);
    }
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
