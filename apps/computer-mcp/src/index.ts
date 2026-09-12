import { DurableObject } from "cloudflare:workers";
import {
    type DurableObjectStorageLike,
    getWorkspace,
    type WorkspaceClient,
    WorkspaceServiceProxy,
    withWorkspace,
} from "@cloudflare/computer";
import type { WorkspaceLike } from "@cloudflare/computer/assets";
import { WorkerShellBackend } from "@cloudflare/computer/backends/worker-shell";
import { createGitClient } from "@cloudflare/computer/git";
import curlModules from "@cloudflare/computer/shell/curl";
import jqModules from "@cloudflare/computer/shell/jq";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { withMcpUsageHeaders } from "../../../shared/mcp-usage.ts";
import {
    COMPUTER_TOOL_CALL_PRICE,
    MCP_USER_ID_HEADER,
} from "../../../shared/registry/mcp.ts";
import { createMediaAssets, type MediaService } from "./assets.ts";
import { createComputerMcpServer, HOME } from "./server.ts";

const TOOL_CALL_RATE = "computer.tool_call.v1";

type Env = {
    COMPUTER: DurableObjectNamespace<Computer>;
    LOADER: WorkerLoader;
    MEDIA: MediaService;
};

const README_PATH = `${HOME}/README.md`;
const README = `# Your computer

This is your private, persistent computer. Everything you write survives
between runs. /workspace is your home folder: keep one folder per project
in it (for example /workspace/thesis) and pass that folder as cwd.

## Memory convention

- /workspace/memory/facts.md — current facts about the user and the work.
  Edit in place when something changes; keep it short.
- /workspace/memory/log/YYYY-MM-DD.md — append-only journal. Add a dated
  entry at the end of each run: what happened, what was decided, open items.
- Before answering questions about earlier work, grep /workspace/memory.

## Shell

The only tool is bash (no Node, no Python; coreutils, grep, sed, awk,
jq, tar, curl and git are available). Write a file by passing its
content as stdin to \`cat > path\`.

## Importing and sharing

- In: \`curl -o path <url>\` for any public URL; \`git clone <https-url>\`
  for any public repository.
- Out: \`assets publish <path>\` copies one file to public media storage
  and prints an unlisted URL that stays valid 30 days; tar a folder first.
  For anything the user wants to keep, \`git push\` to a repository they
  own: they give you a token scoped to that one repository and you put it
  in the remote URL (https://x:TOKEN@github.com/user/repo.git). The token
  is stored in this computer's git config, nowhere else.
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
            git: createGitClient(),
            // Typed as unknown: comparing Workspace to WorkspaceLike makes tsc
            // recurse through the fs overloads until it gives up.
            assets: (workspace: unknown) =>
                createMediaAssets(workspace as WorkspaceLike, env.MEDIA),
            defaultGitIdentity: {
                name: "Pollinations Agent",
                email: "agent@pollinations.ai",
            },
            backends: [
                new WorkerShellBackend({
                    loader: env.LOADER,
                    workspace: { binding: "COMPUTER", id: ctx.id.toString() },
                    ctx,
                    egress: { mode: "direct" },
                    commands: [jqModules, curlModules],
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
    id?: string | number | null;
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
        // One Durable Object per user; its SQLite holds the whole filesystem.
        const stub = env.COMPUTER.get(
            env.COMPUTER.idFromName(`user:${userId}`),
        );
        return stub.fetch(request);
    },
} satisfies ExportedHandler<Env>;
