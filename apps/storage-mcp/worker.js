import {
    createStore,
    MEMORY_FILE,
    normalizeRepoRef,
    readMemory,
    writeMemory,
} from "./src/store.js";

/**
 * Stateless Streamable HTTP MCP exposing a general Git-storage primitive on
 * Cloudflare Artifacts (default) or a connected GitHub repository, behind the
 * same tool contract. Scoped by caller (from bearer token) + agent (x-agent-id).
 *
 * The model receives tool inputs/outputs only — never a repository token. The
 * Worker resolves the backend credential (Artifacts binding / GitHub install
 * token) from env and passes it to the store; the store never returns it.
 */

const DEFAULT_BACKEND = "artifacts";

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;
    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) return null;
    return token;
}

function unauthorized() {
    return Response.json(
        {
            error: "unauthorized",
            message: "Send a Pollinations API key as a bearer token.",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate":
                    'Bearer realm="storage-mcp.pollinations.ai"',
            },
        },
    );
}

/**
 * Resolve caller identity from the bearer token. In production this verifies the
 * Pollinations API key; for the prototype we derive a stable caller slug. The
 * resolved caller is the ONLY thing that scopes repositories — the model cannot
 * choose it.
 */
function resolveCaller(token) {
    // Stable, non-reversible-ish slug from the token; real impl validates the key.
    const slug =
        token
            .replace(/[^a-z0-9]/gi, "")
            .toLowerCase()
            .slice(0, 40) || "anon";
    return `caller-${slug}`;
}

async function buildServer({
    caller,
    agent,
    env,
    githubToken,
    backend = DEFAULT_BACKEND,
}) {
    const { McpServer } = await import("@modelcontextprotocol/server");
    const { z } = await import("zod");
    const server = new McpServer({
        name: "pollinations-storage-mcp",
        version: "0.1.0",
    });

    const storeFor = (repo) => {
        const ref = normalizeRepoRef(caller, agent, repo);
        return createStore(backend, { ref, env, githubToken });
    };

    server.tool(
        "list_repositories",
        "List repositories in this caller/agent scope",
        {},
        async () => {
            const repos = await storeFor("__scope__").listRepos();
            return { content: [{ type: "text", text: JSON.stringify(repos) }] };
        },
    );

    server.tool(
        "read_file",
        "Read a file from a scoped repository",
        { repo: z.string(), path: z.string() },
        async ({ repo, path }) => {
            const store = storeFor(repo);
            const { content, sha } = await store.readFile(path);
            return {
                content: [
                    { type: "text", text: JSON.stringify({ sha, content }) },
                ],
            };
        },
    );

    server.tool(
        "write_commit",
        "Commit one or more files to a scoped repository",
        {
            repo: z.string(),
            message: z.string(),
            files: z.array(z.object({ path: z.string(), content: z.string() })),
        },
        async ({ repo, message, files }) => {
            const store = storeFor(repo);
            const result = await store.writeCommit({ message, files });
            return {
                content: [{ type: "text", text: JSON.stringify(result) }],
            };
        },
    );

    server.tool(
        "history",
        "Show commit history of a scoped repository",
        { repo: z.string(), limit: z.number().optional() },
        async ({ repo, limit }) => {
            const store = storeFor(repo);
            const commits = await store.history({ limit: limit ?? 20 });
            return {
                content: [{ type: "text", text: JSON.stringify(commits) }],
            };
        },
    );

    server.tool(
        "fork_repository",
        "Fork a source repo into a new repo within the same scope",
        { source: z.string(), into: z.string() },
        async ({ source, into }) => {
            const store = storeFor(source);
            const result = await store.fork({ into, source });
            return {
                content: [{ type: "text", text: JSON.stringify(result) }],
            };
        },
    );

    // Memory is a CONVENTION, not part of the storage API.
    server.tool(
        "read_memory",
        "Read the agent MEMORY.md if present (convention only)",
        { repo: z.string() },
        async ({ repo }) => {
            const store = storeFor(repo);
            const content = await readMemory(store);
            return { content: [{ type: "text", text: content ?? "" }] };
        },
    );

    server.tool(
        "write_memory",
        "Write/replace the agent MEMORY.md (convention only)",
        { repo: z.string(), content: z.string() },
        async ({ repo, content }) => {
            const store = storeFor(repo);
            const result = await writeMemory(store, content);
            return {
                content: [{ type: "text", text: JSON.stringify(result) }],
            };
        },
    );

    return server;
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "pollinations-storage-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
                backend: DEFAULT_BACKEND,
            });
        }
        if (url.pathname !== "/")
            return new Response("Not found", { status: 404 });

        const token = readBearerToken(request);
        if (!token) return unauthorized();

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

        const caller = resolveCaller(token);
        const agent = request.headers.get("x-agent-id") ?? "default";
        const backend =
            request.headers.get("x-storage-backend") ?? DEFAULT_BACKEND;
        const githubToken = request.headers.get("x-github-token") ?? undefined;

        const { createMcpHandler } = await import(
            "@modelcontextprotocol/server"
        );
        const mcpHandler = createMcpHandler(
            () => buildServer({ caller, agent, env, githubToken, backend }),
            { stateless: true, onerror: (error) => console.error(error) },
        );
        return mcpHandler.fetch(request, { authInfo: { token } });
    },
};

// Exported for tests that want to drive the store directly.
export { MEMORY_FILE };
