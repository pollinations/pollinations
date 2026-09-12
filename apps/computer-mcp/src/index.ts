import { DurableObject } from "cloudflare:workers";
import {
  type DurableObjectStorageLike,
  getWorkspace,
  type WorkspaceOptions,
  WorkspaceProxy,
  WorkspaceServiceProxy,
  withWorkspace,
} from "@cloudflare/computer";
import {
  CloudflareContainerBackend,
  withWorkspaceContainer,
} from "@cloudflare/computer/backends/container";
import { WorkerShellBackend } from "@cloudflare/computer/backends/worker-shell";
import { createGitClient } from "@cloudflare/computer/git";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { MCP_USER_ID_HEADER } from "../../../shared/registry/mcp.ts";
import { createComputerMCPServer } from "./server.js";

interface Env {
  LOADER: WorkerLoader;
  COMPUTER_MCP: DurableObjectNamespace<ComputerMCP>;
}

export { WorkspaceProxy, WorkspaceServiceProxy };

class ComputerMCPDurableObject extends DurableObject<Env> {}

class ComputerMCPBase extends withWorkspaceContainer(ComputerMCPDurableObject) {
  readonly workerShell = new WorkerShellBackend({
    loader: this.env.LOADER,
    workspace: { binding: "COMPUTER_MCP", id: this.ctx.id.toString() },
    ctx: this.ctx,
    egress: { mode: "none" },
  });

  readonly containerShell = new CloudflareContainerBackend({
    container: () => this,
    workspace: { binding: "COMPUTER_MCP", id: this.ctx.id.toString() },
    egress: { mode: "direct" },
  });
}

function workspaceOptions(self: InstanceType<typeof ComputerMCPBase>): WorkspaceOptions {
  const { ctx } = self as unknown as { ctx: DurableObjectState };
  return {
    storage: ctx.storage as unknown as DurableObjectStorageLike,
    sessionId: ctx.id.toString(),
    git: createGitClient(),
    backends: [self.workerShell, self.containerShell],
  };
}

/** One durable Computer workspace exposed through a Code Mode MCP server. */
export class ComputerMCP extends withWorkspace(ComputerMCPBase, workspaceOptions) {
  override async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    // computerd reaches this callback through an internal binding. The public
    // Worker forwards only / (gen rewrites every /mcp/computer request to /).
    if (path === "/api") return this.containerShell.handleFetch(request);
    if (path !== "/") return new Response("not found", { status: 404 });
    if (request.method !== "POST") return methodNotAllowed();

    const server = await createComputerMCPServer(await getWorkspace(this), this.env.LOADER);
    const transport = new WebStandardStreamableHTTPServerTransport();
    await server.connect(transport);
    return transport.handleRequest(request);
  }
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok\n");
    if (url.pathname !== "/") return new Response("not found", { status: 404 });

    // gen.pollinations.ai authenticates the caller and sets this header;
    // the Worker is private, so a missing header means a misrouted request.
    const userId = request.headers.get(MCP_USER_ID_HEADER);
    if (!userId) return new Response("Unauthorized\n", { status: 401 });

    const id = env.COMPUTER_MCP.idFromName(userId);
    return env.COMPUTER_MCP.get(id).fetch(request);
  },
} satisfies ExportedHandler<Env>;

function methodNotAllowed() {
  return new Response("The stateless MCP endpoint accepts POST requests only.\n", {
    status: 405,
    headers: { allow: "POST" },
  });
}
