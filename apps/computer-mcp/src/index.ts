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
import {
    createComputerMcpServer,
    isPublicPath,
    PRIVATE_ROOT,
    PUBLIC_ROOT,
} from "./server.ts";

const TOOL_CALL_RATE = "computer.tool_call.v1";

type Env = {
    COMPUTER: DurableObjectNamespace<Computer>;
    LOADER: WorkerLoader;
    MEDIA: MediaService;
};

const SHELL_NOTES = `## Shell

The only tool is bash (no Node, no Python; coreutils, grep, sed, awk,
jq, tar, curl and git are available). Write a file by passing its
content as stdin to \`cat > path\`. \`assets publish <path>\` copies a file
to public media storage and prints its URL; \`curl -o path <url>\`
downloads one back. That pair is also how files move between this
computer and the other one (private /workspace, shared /public): a
command only sees the computer its cwd is on.
`;

const PRIVATE_README = `# Your computer

This is your private, persistent computer. Everything under /workspace
survives between runs. Keep one folder per project (for example
/workspace/thesis) and pass it as cwd. /public is a separate computer
shared with every Pollinations user; use a cwd under /public to work
there.

## Memory convention

- /workspace/memory/facts.md — current facts about the user and the work.
  Edit in place when something changes; keep it short.
- /workspace/memory/log/YYYY-MM-DD.md — append-only journal. Add a dated
  entry at the end of each run: what happened, what was decided, open items.
- Before answering questions about earlier work, grep /workspace/memory.

${SHELL_NOTES}`;

const PUBLIC_README = `# The public computer

Everything under /public is shared with every Pollinations user and their
agents. Anyone can read, change or delete these files; nothing here is
private, so never store secrets or personal data. Keep one folder per
topic, prefer appending (>>) to rewriting shared files, and commit with
git if history matters. Your private computer is /workspace, reachable
with a cwd under /workspace.

${SHELL_NOTES}`;

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
        await seedReadme(workspace, isPublicPath(cwdOf(payload)));
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
    params?: { name?: string; arguments?: { cwd?: unknown } };
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

function cwdOf(payload: JsonRpcPayload): string {
    const cwd = payload.params?.arguments?.cwd;
    return typeof cwd === "string" ? cwd : PRIVATE_ROOT;
}

async function seedReadme(
    workspace: WorkspaceClient,
    isPublic: boolean,
): Promise<void> {
    const root = isPublic ? PUBLIC_ROOT : PRIVATE_ROOT;
    const readmePath = `${root}/README.md`;
    try {
        await workspace.fs.stat(readmePath);
    } catch {
        await workspace.fs.mkdir(isPublic ? root : `${root}/memory/log`, {
            recursive: true,
        });
        await workspace.fs.writeFile(
            readmePath,
            isPublic ? PUBLIC_README : PRIVATE_README,
        );
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
        const payload = await readJsonRpc(request);
        const cwd = cwdOf(payload);
        if (!cwd.startsWith("/")) {
            return Response.json({
                jsonrpc: "2.0",
                id: payload.id ?? null,
                error: {
                    code: -32602,
                    message: `cwd must be an absolute path under ${PRIVATE_ROOT} or ${PUBLIC_ROOT}`,
                },
            });
        }
        // The cwd picks the computer: one Durable Object per user for
        // /workspace, a single shared one for /public. A command can only
        // see the computer it runs on, so the two never leak into each other.
        const stub = env.COMPUTER.get(
            env.COMPUTER.idFromName(
                isPublicPath(cwd) ? "shared:public" : `user:${userId}`,
            ),
        );
        return stub.fetch(request);
    },
} satisfies ExportedHandler<Env>;
