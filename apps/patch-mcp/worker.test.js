import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["patch_diff", "patch_apply"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(token = TOKEN) {
    const client = new Client(
        { name: "patch-mcp-worker-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://patch-mcp.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: {
                headers: { Authorization: `Bearer ${token}` },
            },
        },
    );
    await client.connect(transport);
    return client;
}

function textOf(result) {
    return result.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n");
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://patch-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://patch-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="patch-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://patch-mcp.pollinations.ai/mcp"),
    );
    assert.equal(oldEndpoint.status, 404);
});

test("lists the patch tools", async () => {
    const client = await connectClient();
    try {
        const { tools } = await client.listTools();
        assert.deepEqual(
            tools.map((tool) => tool.name).sort(),
            [...EXPECTED_TOOLS].sort(),
        );
    } finally {
        await client.close();
    }
});

test("turns an edit into a patch and back", async () => {
    const client = await connectClient();
    const before = "one\ntwo\nthree\n";
    const after = "one\nTWO\nthree\nfour\n";
    try {
        const diff = await client.callTool({
            name: "patch_diff",
            arguments: { before, after, path: "notes.txt" },
        });
        const patch = diff.content[0].text;
        assert.match(patch, /^--- a\/notes\.txt$/m);
        assert.match(patch, /^-two$/m);
        assert.match(patch, /^\+TWO$/m);

        const applied = await client.callTool({
            name: "patch_apply",
            arguments: { text: before, patch },
        });
        assert.equal(applied.content[0].text, after);
    } finally {
        await client.close();
    }
});

test("dry run verifies without changing the text", async () => {
    const client = await connectClient();
    try {
        const diff = await client.callTool({
            name: "patch_diff",
            arguments: { before: "a\nb\n", after: "a\nb\nc\n" },
        });
        const result = await client.callTool({
            name: "patch_apply",
            arguments: {
                text: "a\nb\n",
                patch: diff.content[0].text,
                dry_run: true,
            },
        });
        assert.match(textOf(result), /All 1 hunks match/);
    } finally {
        await client.close();
    }
});

test("a bad hunk reports the mismatch instead of writing", async () => {
    const client = await connectClient();
    try {
        const diff = await client.callTool({
            name: "patch_diff",
            arguments: { before: "a\nb\n", after: "a\nB\n" },
        });
        const failed = await client.callTool({
            name: "patch_apply",
            arguments: {
                text: "nothing\nlike it\n",
                patch: diff.content[0].text,
                search_lines: 0,
            },
        });
        assert.equal(failed.isError, true);
        assert.match(textOf(failed), /does not match/);
    } finally {
        await client.close();
    }
});

test("rejects an oversized text", async () => {
    const client = await connectClient();
    try {
        const huge = "x".repeat(200_001);
        const result = await client.callTool({
            name: "patch_diff",
            arguments: { before: huge, after: "small" },
        });
        assert.equal(result.isError, true);
    } finally {
        await client.close();
    }
});
