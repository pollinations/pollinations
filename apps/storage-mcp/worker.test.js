import assert from "node:assert/strict";
import test from "node:test";
import worker from "./worker.js";

/**
 * These first two tests need no SDK — they prove the stateless HTTP shell:
 * health probe and bearer-auth enforcement. The MCP tool round-trip below
 * requires `@modelcontextprotocol/sdk` (install devDependencies first).
 */
test("serves health and advertises the storage backend", async () => {
    const res = await worker.fetch(
        new Request("https://storage-mcp.pollinations.ai/health"),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.stateless, true);
    assert.equal(body.backend, "artifacts");
});

test("rejects requests without a bearer token", async () => {
    const res = await worker.fetch(
        new Request("https://storage-mcp.pollinations.ai/"),
    );
    assert.equal(res.status, 401);
});

test("rejects batch JSON-RPC requests", async () => {
    const res = await worker.fetch(
        new Request("https://storage-mcp.pollinations.ai/", {
            method: "POST",
            headers: {
                authorization: "Bearer tok",
                "content-type": "application/json",
            },
            body: JSON.stringify([{ jsonrpc: "2.0" }]),
        }),
    );
    assert.equal(res.status, 400);
});

// --- MCP tool round-trip (requires @modelcontextprotocol/sdk) ---
let Client, StreamableHTTPClientTransport;
try {
    ({ Client, StreamableHTTPClientTransport } = await import(
        "@modelcontextprotocol/client"
    ));
} catch {
    // SDK not installed in this environment; skip the integration test.
}

if (Client) {
    const TOKEN = "sk_test_local";

    // In-memory fake of the Artifacts binding so the round-trip runs without a
    // live Cloudflare credential. Mirrors the contract used by ArtifactsStore.
    class FakeArtifacts {
        constructor() {
            this.repos = new Map();
        }
        async fetch(url, init) {
            const u = new URL(
                String(url).replace("artifact:", "https://artifact/"),
            );
            const parts = u.pathname.split("/").filter(Boolean);
            const body = init.body ? JSON.parse(init.body) : undefined;
            if (parts[1] === "repos" && parts.length === 3) {
                const prefix = `${parts[1]}/${parts[2]}`;
                return ok(200, {
                    repos: [...this.repos.keys()]
                        .filter((k) => k.startsWith(`${prefix}/`))
                        .map((k) => ({ name: k.split("/")[2] })),
                });
            }
            const scope = `${parts[1]}/${parts[2]}/${parts[3]}`;
            const repo = this.repos.get(scope) ?? { files: {}, commits: [] };
            this.repos.set(scope, repo);
            if (parts[4] === "files") {
                const f = repo.files[decodeURIComponent(parts[5])];
                if (!f) return ok(404, { error: "not found" });
                return ok(200, f);
            }
            if (parts[4] === "commits") {
                const sha = `sha-${repo.commits.length + 1}`;
                for (const file of body.files)
                    repo.files[file.path] = { content: file.content, sha };
                repo.commits.push({ sha, message: body.message });
                return ok(200, { sha, paths: body.files.map((f) => f.path) });
            }
            if (parts[4] === "history")
                return ok(200, { commits: repo.commits });
            if (parts[4] === "fork") {
                this.repos.set(
                    `${parts[1]}/${parts[2]}/${body.into}`,
                    structuredClone(repo),
                );
                return ok(200, { repo: body.into });
            }
            return ok(404, { error: "no route" });
        }
    }
    function ok(status, obj) {
        return { ok: status < 400, status, json: async () => obj };
    }
    const ENV = { ARTIFACTS: new FakeArtifacts() };

    function localFetch(input, init) {
        const request =
            input instanceof Request ? input : new Request(input, init);
        return worker.fetch(request, ENV);
    }
    async function connect() {
        const client = new Client(
            { name: "storage-test", version: "0.0.1" },
            { capabilities: {} },
        );
        const transport = new StreamableHTTPClientTransport(
            new URL("https://storage-mcp.pollinations.ai"),
            {
                fetch: localFetch,
                requestInit: {
                    headers: {
                        authorization: `Bearer ${TOKEN}`,
                        "x-agent-id": "tester",
                    },
                },
            },
        );
        await client.connect(transport);
        return client;
    }
    test("exposes the Git-storage tool set", async () => {
        const client = await connect();
        const tools = await client.listTools();
        const names = tools.tools.map((t) => t.name);
        for (const expected of [
            "list_repositories",
            "read_file",
            "write_commit",
            "history",
            "fork_repository",
            "read_memory",
            "write_memory",
        ]) {
            assert.ok(names.includes(expected), `missing tool: ${expected}`);
        }
        await client.close();
    });
    test("write_commit then read_file round-trips through the MCP tool", async () => {
        const client = await connect();
        const wrote = await client.callTool({
            name: "write_commit",
            arguments: {
                repo: "demo",
                message: "init",
                files: [{ path: "hello.txt", content: "world" }],
            },
        });
        assert.ok(wrote.content?.[0]?.text.includes("sha"));
        const read = await client.callTool({
            name: "read_file",
            arguments: { repo: "demo", path: "hello.txt" },
        });
        assert.ok(read.content?.[0]?.text.includes("world"));
        await client.close();
    });
}
