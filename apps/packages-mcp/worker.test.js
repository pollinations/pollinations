import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const ORIGIN = "https://packages-mcp.pollinations.ai";
const TOKEN = "sk_test_request_scoped";

async function connectClient(options = {}) {
    const client = new Client(
        { name: "packages-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    await client.connect(
        new StreamableHTTPClientTransport(new URL(ORIGIN), {
            fetch: (input, init) =>
                worker.fetch(
                    input instanceof Request ? input : new Request(input, init),
                ),
            requestInit: {
                headers: {
                    Authorization: `Bearer ${TOKEN}`,
                    Cookie: "session=private",
                },
            },
        }),
    );
    return client;
}

test("serves health, requires bearer auth and rejects unknown paths and batches", async () => {
    const health = await worker.fetch(new Request(`${ORIGIN}/health`));
    assert.equal(health.status, 200);
    assert.equal((await health.json()).stateless, true);
    for (const authorization of [null, "Basic abc", "Bearer", "Bearer a b"]) {
        const headers = authorization ? { authorization } : {};
        const response = await worker.fetch(new Request(ORIGIN, { headers }));
        assert.equal(response.status, 401);
        assert.equal(
            response.headers.get("www-authenticate"),
            'Bearer realm="packages-mcp.pollinations.ai"',
        );
    }
    assert.equal(
        (await worker.fetch(new Request(`${ORIGIN}/other`))).status,
        404,
    );
    const batch = await worker.fetch(
        new Request(ORIGIN, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify([
                { jsonrpc: "2.0", id: 1, method: "tools/list" },
            ]),
        }),
    );
    assert.equal(batch.status, 400);
});

test("exposes one read-only tool over modern and legacy stateless HTTP", async () => {
    for (const options of [{ versionNegotiation: { mode: "auto" } }, {}]) {
        const client = await connectClient(options);
        try {
            assert.equal(
                client.getProtocolEra(),
                options.versionNegotiation ? "modern" : "legacy",
            );
            const { tools } = await client.listTools();
            assert.deepEqual(
                tools.map(({ name }) => name),
                ["package_lookup"],
            );
            assert.equal(tools[0].annotations.readOnlyHint, true);
        } finally {
            await client.close();
        }
    }
});

test("looks up npm, PyPI, and Crates.io packages without forwarding caller credentials", async (t) => {
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(input);
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("accept"), "application/json");
        assert.equal(headers.has("authorization"), false);
        assert.equal(headers.has("cookie"), false);
        assert.equal(init?.redirect, "manual");

        if (
            url.href ===
            "https://registry.npmjs.org/@modelcontextprotocol/server/latest"
        ) {
            return Response.json({
                name: "@modelcontextprotocol/server",
                version: "2.3.1",
                description: "MCP server runtime",
                license: "MIT",
                homepage: "https://modelcontextprotocol.io",
                repository: {
                    type: "git",
                    url: "git+https://github.com/modelcontextprotocol/typescript-sdk.git",
                },
                engines: { node: ">=20" },
                dependencies: { zod: "^4.0.0" },
            });
        }

        if (url.href === "https://pypi.org/pypi/fastapi/0.143.2/json") {
            return Response.json({
                info: {
                    name: "fastapi",
                    version: "0.143.2",
                    summary: "FastAPI framework",
                    license_expression: "MIT",
                    requires_python: ">=3.10",
                    project_urls: {
                        Homepage: "https://fastapi.tiangolo.com",
                        Repository: "https://github.com/fastapi/fastapi",
                    },
                    requires_dist: ["starlette>=0.40.0", "pydantic>=2.7.0"],
                },
            });
        }

        if (url.href === "https://crates.io/api/v1/crates/serde") {
            return Response.json({
                crate: {
                    name: "serde",
                    max_stable_version: "1.0.229",
                    description: "Serialization framework",
                    repository: "https://github.com/serde-rs/serde",
                },
                versions: [
                    {
                        num: "1.0.229",
                        license: "MIT OR Apache-2.0",
                        rust_version: "1.56",
                        yanked: false,
                    },
                ],
            });
        }

        throw new Error(`Unexpected fetch: ${url.href}`);
    });

    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const npmResult = await client.callTool({
        name: "package_lookup",
        arguments: { name: "@modelcontextprotocol/server" },
    });
    assert.notEqual(npmResult.isError, true);
    assert.deepEqual(JSON.parse(npmResult.content[0].text), {
        ecosystem: "npm",
        name: "@modelcontextprotocol/server",
        version: "2.3.1",
        description: "MCP server runtime",
        license: "MIT",
        homepage: "https://modelcontextprotocol.io",
        repository: "https://github.com/modelcontextprotocol/typescript-sdk",
        engines: { node: ">=20" },
        dependencies: { zod: "^4.0.0" },
        registryUrl:
            "https://www.npmjs.com/package/@modelcontextprotocol/server/v/2.3.1",
    });

    const pypiResult = await client.callTool({
        name: "package_lookup",
        arguments: {
            ecosystem: "pypi",
            name: "fastapi",
            version: "0.143.2",
        },
    });
    assert.notEqual(pypiResult.isError, true);
    assert.deepEqual(JSON.parse(pypiResult.content[0].text), {
        ecosystem: "pypi",
        name: "fastapi",
        version: "0.143.2",
        description: "FastAPI framework",
        license: "MIT",
        homepage: "https://fastapi.tiangolo.com",
        repository: "https://github.com/fastapi/fastapi",
        requiresPython: ">=3.10",
        dependencies: ["starlette>=0.40.0", "pydantic>=2.7.0"],
        registryUrl: "https://pypi.org/project/fastapi/0.143.2",
    });

    const cratesResult = await client.callTool({
        name: "package_lookup",
        arguments: {
            ecosystem: "crates",
            name: "serde",
        },
    });
    assert.notEqual(cratesResult.isError, true);
    assert.deepEqual(JSON.parse(cratesResult.content[0].text), {
        ecosystem: "crates",
        name: "serde",
        version: "1.0.229",
        description: "Serialization framework",
        license: "MIT OR Apache-2.0",
        repository: "https://github.com/serde-rs/serde",
        rustVersion: "1.56",
        registryUrl: "https://crates.io/crates/serde",
    });
});

test("rejects invalid package names and converts 404, redirect, and upstream errors into tool errors", async (t) => {
    let mockedResponse = new Response("not found", { status: 404 });
    t.mock.method(globalThis, "fetch", async () => {
        if (mockedResponse instanceof Error) throw mockedResponse;
        return mockedResponse;
    });

    const client = await connectClient();
    t.after(() => client.close());

    const invalidName = await client.callTool({
        name: "package_lookup",
        arguments: { ecosystem: "npm", name: "../secret" },
    });
    assert.equal(invalidName.isError, true);
    assert.match(invalidName.content[0].text, /Invalid npm package name/);

    const missing = await client.callTool({
        name: "package_lookup",
        arguments: { ecosystem: "npm", name: "nonexistent-pkg" },
    });
    assert.equal(missing.isError, true);
    assert.match(
        missing.content[0].text,
        /Package nonexistent-pkg@latest was not found on npm/,
    );

    mockedResponse = new Response(null, {
        status: 302,
        headers: { Location: "https://example.com" },
    });
    const redirected = await client.callTool({
        name: "package_lookup",
        arguments: { ecosystem: "pypi", name: "requests" },
    });
    assert.equal(redirected.isError, true);
    assert.match(redirected.content[0].text, /HTTP 302/);
});
