import { evictDurableObject, runInDurableObject, SELF } from "cloudflare:test";
import { expect, it } from "vitest";
import { call, connect, ownerStub } from "./test-client";

it("negotiates the MCP SDK protocol and exposes only the granted tools", async () => {
    for (const [permissions, tools] of [
        [
            ["read", "write"],
            ["read", "search", "write"],
        ],
        [["read"], ["read", "search"]],
        [["write"], ["write"]],
    ]) {
        const client = await connect("tools", "key", permissions);
        expect(
            (await client.listTools()).tools.map((tool) => tool.name).sort(),
        ).toEqual(tools);
        await client.close();
    }
});

it("requires the complete gateway identity and rejects alternate routes", async () => {
    const response = await SELF.fetch("https://mcp.internal/", {
        method: "POST",
        body: "{}",
    });
    expect(response.status).toBe(401);
    expect((await SELF.fetch("https://mcp.internal/mcp")).status).toBe(404);
    expect(
        (
            await SELF.fetch("https://mcp.internal/", {
                method: "POST",
                body: "{}",
                headers: {
                    "x-pollinations-user-id": "user",
                    "x-pollinations-vault-actor": '["key",null]',
                    "x-pollinations-vault-permissions": '["admin"]',
                },
            })
        ).status,
    ).toBe(401);
});

it("bounds streamed requests even without Content-Length", async () => {
    const response = await SELF.fetch("https://mcp.internal/", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-pollinations-user-id": "bounded",
            "x-pollinations-vault-actor": '["key",null]',
            "x-pollinations-vault-permissions": '["write"]',
        },
        body: new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array(131_073));
                controller.close();
            },
        }),
    });
    expect(response.status).toBe(413);
});

it("arbitrates concurrent exact retries into one revision and receipt", async () => {
    const command = {
        idempotencyKey: "concurrent",
        nodes: [{ id: "fact", name: "Fact" }],
    };
    const [first, second] = await Promise.all([
        call("write", command),
        call("write", command),
    ]);
    expect(first.data?.head).toBe(1);
    expect(second.data).toEqual(first.data);
    const read = await call("read", { ids: ["fact"], includeHistory: true });
    expect(read.data?.history).toHaveLength(1);
});

it("rolls back the complete write on receipt failure and preserves committed memory across eviction", async () => {
    const stub = ownerStub();
    await runInDurableObject(stub, (_instance, state) => {
        state.storage.sql.exec(
            "CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'test'); END",
        );
    });
    const command = {
        idempotencyKey: "atomic",
        nodes: [{ id: "fact", name: "Persistent fact" }],
    };
    expect((await call("write", command)).error).toBe("internal");
    await runInDurableObject(stub, (_instance, state) => {
        for (const table of [
            "graph_nodes",
            "graph_relations",
            "graph_revisions",
            "graph_fts",
            "receipts",
        ]) {
            expect(
                state.storage.sql
                    .exec(`SELECT COUNT(*) AS count FROM ${table}`)
                    .one().count,
            ).toBe(0);
        }
        expect(
            state.storage.sql
                .exec("SELECT value FROM meta WHERE key='graph_head'")
                .one().value,
        ).toBe("0");
        state.storage.sql.exec("DROP TRIGGER fail_receipt");
    });
    const first = await call("write", command);
    expect(first.data?.head).toBe(1);
    await evictDurableObject(stub);
    expect((await call("write", command)).data).toEqual(first.data);
    expect(
        (await call("search", { query: "Persistent fact" })).data?.nodes,
    ).toHaveLength(1);
});
