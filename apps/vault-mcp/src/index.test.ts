import { evictDurableObject, runInDurableObject, SELF } from "cloudflare:test";
import { expect, it } from "vitest";
import { call, connect, ownerStub } from "./test-client";

it("exposes all memory tools for an authenticated user", async () => {
    const client = await connect();
    try {
        expect(
            (await client.listTools()).tools.map((tool) => tool.name).sort(),
        ).toEqual(["read", "search", "write"]);
    } finally {
        await client.close();
    }
});

it("requires the gateway user identity and rejects alternate routes", async () => {
    const response = await SELF.fetch("https://mcp.internal/", {
        method: "POST",
        body: "{}",
    });
    expect(response.status).toBe(401);
    expect((await SELF.fetch("https://mcp.internal/mcp")).status).toBe(404);
});

it("bounds streamed requests even without Content-Length", async () => {
    const response = await SELF.fetch("https://mcp.internal/", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-pollinations-user-id": "bounded",
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

it("accepts concurrent writes to the same node without duplicating it", async () => {
    const command = { nodes: [{ id: "fact", name: "Fact" }] };
    const results = await Promise.all([
        call("write", command),
        call("write", command),
    ]);
    expect(results.every((r) => !r.error)).toBe(true);
    expect((await call("read", { ids: ["fact"] })).data?.nodes).toHaveLength(1);
});

it("rolls back a partially completed write on SQL failure and preserves committed memory across eviction", async () => {
    const stub = ownerStub();
    await runInDurableObject(stub, (_instance, state) => {
        state.storage.sql.exec(
            "CREATE TRIGGER fail_node BEFORE INSERT ON graph_nodes WHEN new.id='second' BEGIN SELECT RAISE(ABORT,'test'); END",
        );
    });
    const command = {
        nodes: [
            { id: "fact", name: "Persistent fact" },
            { id: "second", name: "Second" },
        ],
    };
    expect((await call("write", command)).error).toBe("internal");
    await runInDurableObject(stub, (_instance, state) => {
        for (const table of [
            "graph_nodes",
            "graph_relations",
            "graph_relation_fts",
            "graph_fts",
        ]) {
            expect(
                state.storage.sql
                    .exec(`SELECT COUNT(*) AS count FROM ${table}`)
                    .one().count,
            ).toBe(0);
        }
        state.storage.sql.exec("DROP TRIGGER fail_node");
    });
    expect((await call("write", command)).error).toBeUndefined();
    const before = await call("read", { ids: ["fact"] });
    await evictDurableObject(stub);
    expect((await call("read", { ids: ["fact"] })).data).toEqual(before.data);
    expect(
        (await call("search", { query: "Persistent fact" })).data?.nodes,
    ).toHaveLength(1);
});
