import { runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { graphReadSchema, graphWriteSchema } from "./contracts";
import { graphOperation } from "./graph";
import { call, ownerStub } from "./test-client";

const nodes = [
    { id: "user", name: "User", text: "likes hiking", aliases: ["me"] },
    { id: "project", name: "Orchid", text: "garden project" },
];
const relation = {
    subject: "user",
    predicate: "works_on",
    target: "project",
    evidence: "Planning a greenhouse",
};
const seed = () => call("write", { nodes, relations: [relation] });
const nodeVersion = (data: Record<string, unknown> | undefined, id: string) =>
    (data?.nodes as { id: string; version: string }[]).find((n) => n.id === id)
        ?.version;

it("shares current memory within a user and isolates other users", async () => {
    expect((await seed()).error).toBeUndefined();
    const read = await call("read", { ids: ["user", "project", "absent"] });
    expect(read.data?.nodes).toHaveLength(2);
    expect(read.data?.relations).toEqual([expect.objectContaining(relation)]);
    expect(read.data?.missingIds).toEqual(["absent"]);
    expect((await call("search", {}, "other")).data?.nodes).toEqual([]);
    expect(
        (await call("read", { ids: ["user"] }, "other")).data?.missingIds,
    ).toEqual(["user"]);
});

it("uses opaque versions for updates and rejects stale concurrent writes", async () => {
    const first = await seed();
    const version = nodeVersion(first.data, "user");
    const results = await Promise.all(
        ["a", "b"].map((text) =>
            call("write", {
                nodes: [{ ...nodes[0], text, expectedVersion: version }],
            }),
        ),
    );
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.find((r) => r.error)?.error).toBe("version_conflict");
    expect(nodeVersion(results.find((r) => !r.error)?.data, "user")).not.toBe(
        version,
    );
});

it("identifies relationships by their triple and updates evidence and its search index", async () => {
    const first = await seed();
    expect(
        (
            await call("write", {
                relations: [relation],
            })
        ).error,
    ).toBe("version_conflict");
    const version = (first.data?.relations as { version: string }[])[0].version;
    const update = await call("write", {
        relations: [
            {
                ...relation,
                evidence: "Building a telescope",
                expectedVersion: version,
            },
        ],
    });
    expect(update.error).toBeUndefined();
    expect((await call("search", { query: "greenhouse" })).data?.nodes).toEqual(
        [],
    );
    expect(
        (await call("search", { query: "telescope" })).data?.nodes,
    ).toHaveLength(2);
    expect((await call("search", { mode: "count" })).data?.count).toBe(1);
    const removed = await call("write", {
        relations: [
            {
                subject: relation.subject,
                predicate: relation.predicate,
                target: relation.target,
                delete: true,
                expectedVersion: (
                    update.data?.relations as { version: string }[]
                )[0].version,
            },
        ],
    });
    expect(removed.error).toBeUndefined();
    expect((await call("search", { query: "telescope" })).data?.nodes).toEqual(
        [],
    );
});

it("deletes a node with its relationships and prevents stale writes after recreation", async () => {
    const first = await seed();
    const version = nodeVersion(first.data, "user");
    expect(
        (
            await call("write", {
                nodes: [{ id: "user", delete: true, expectedVersion: version }],
            })
        ).error,
    ).toBeUndefined();
    const read = await call("read", { ids: ["user", "project"] });
    expect(read.data?.nodes).toHaveLength(1);
    expect(read.data?.relations).toEqual([]);
    expect((await call("search", { query: "greenhouse" })).data?.nodes).toEqual(
        [],
    );
    const recreated = await call("write", {
        nodes: [nodes[0]],
    });
    expect(nodeVersion(recreated.data, "user")).not.toBe(version);
    expect(
        (
            await call("write", {
                nodes: [{ ...nodes[0], expectedVersion: version }],
            })
        ).error,
    ).toBe("version_conflict");
});

it("rolls back all records and search indexes when a relationship has a missing endpoint", async () => {
    const result = await call("write", {
        nodes: [nodes[0]],
        relations: [{ ...relation }],
    });
    expect(result.error).toBe("not_found");
    expect((await call("search", {})).data?.nodes).toEqual([]);
    expect((await seed()).error).toBeUndefined();
});

it("searches names, aliases, text and relationship evidence with all terms", async () => {
    await seed();
    for (const query of ["me", "hiking", "Orchid", "Planning greenhouse"]) {
        expect((await call("search", { query })).data?.nodes).not.toHaveLength(
            0,
        );
    }
    expect(
        (await call("search", { query: "hiking nonexistent" })).data?.nodes,
    ).toEqual([]);
    expect((await call("search", { query: '***"' })).data?.nodes).toEqual([]);
    const first = await call("search", { limit: 1 });
    expect(first.data?.nextOffset).toBe(1);
    const second = await call("search", {
        limit: 1,
        offset: first.data?.nextOffset,
    });
    expect(second.data?.nextOffset).toBeNull();
    expect(nodeVersion(first.data, "project")).toEqual(expect.any(String));
    expect(nodeVersion(second.data, "user")).toEqual(expect.any(String));
});

it("counts relationships and distinct targets exactly and pages neighborhoods", async () => {
    await seed();
    for (let batch = 0; batch < 2; batch++) {
        expect(
            (
                await call("write", {
                    relations: Array.from({ length: 20 }, (_, i) => ({
                        ...relation,
                        predicate: `link_${batch}_${i.toString().padStart(2, "0")}`,
                    })),
                })
            ).error,
        ).toBeUndefined();
    }
    expect(
        (await call("search", { mode: "count", subject: "user" })).data?.count,
    ).toBe(41);
    expect(
        (
            await call("search", {
                mode: "count",
                subject: "user",
                countUnit: "targets",
            })
        ).data?.count,
    ).toBe(1);
    expect(
        (await call("search", { mode: "count", predicate: "works_on" })).data
            ?.count,
    ).toBe(1);
    const first = await call("read", { ids: ["user"] });
    expect(first.data?.relations).toHaveLength(32);
    expect(first.data?.nextRelationOffset).toBe(32);
    const next = await call("read", {
        ids: ["user"],
        relationOffset: first.data?.nextRelationOffset,
    });
    expect(next.data?.relations).toHaveLength(9);
    expect(next.data?.nextRelationOffset).toBeNull();
    expect(next.data?.truncated).toBe(false);
});

it("bounds output while always making progress for maximum escaped field sizes", async () => {
    const large = {
        id: "large",
        name: "\u0000".repeat(256),
        text: "\u0000".repeat(4096),
        aliases: Array.from({ length: 16 }, () => "\u0000".repeat(128)),
    };
    await call("write", { nodes: [large] });
    await call("write", {
        nodes: [{ ...large, id: "other" }],
    });
    await call("write", {
        relations: Array.from({ length: 3 }, (_, i) => ({
            subject: "large",
            predicate: `p${i}`,
            target: "other",
            evidence: "\u0000".repeat(2048),
        })),
    });
    const first = await call("read", { ids: ["large", "other"] });
    expect(first.data?.nodes).toHaveLength(1);
    expect(first.data?.missingIds).toEqual([]);
    expect(first.data?.nextRelationOffset).toBe(1);
    expect(first.data?.truncated).toBe(true);
    const second = await call("read", { ids: ["large"], relationOffset: 1 });
    expect(second.data?.relations).toHaveLength(1);
    expect(second.data?.nextRelationOffset).toBe(2);
    expect(
        new TextEncoder().encode(JSON.stringify(first.data)).length,
    ).toBeLessThan(80_000);
    const search = await call("search", {});
    expect(search.data?.nextOffset).toBe(1);
    expect((await call("search", { offset: 1 })).data?.nextOffset).toBeNull();
});

it("rejects ownership overrides, empty writes and excessive input", async () => {
    for (const input of [
        {},
        { nodes, owner: "someone-else" },
        {
            nodes: [{ ...nodes[0], text: "x".repeat(4097) }],
        },
    ]) {
        expect((await call("write", input)).result.isError).toBe(true);
    }
    expect(
        (
            await call("write", {
                nodes: Array.from({ length: 8 }, (_, i) => ({
                    id: `n${i}`,
                    name: "Large",
                    text: "記".repeat(4096),
                })),
            })
        ).error,
    ).toBe("limit_exceeded");
});

it("enforces write and read limits and resets them each minute", async () => {
    await runInDurableObject(ownerStub(), async (_instance, state) => {
        state.storage.sql.exec(
            "INSERT INTO rate_limits VALUES ('write',0,120),('read',0,600)",
        );
        const write = graphWriteSchema.parse({ nodes: [nodes[0]] });
        const read = graphReadSchema.parse({ ids: ["user"] });
        expect(() => graphOperation(state.storage, "write", write, 0)).toThrow(
            "rate_limited",
        );
        expect(() => graphOperation(state.storage, "read", read, 0)).toThrow(
            "rate_limited",
        );
        expect(() =>
            graphOperation(state.storage, "write", write, 60_000),
        ).not.toThrow();
        expect(() =>
            graphOperation(state.storage, "read", read, 60_000),
        ).not.toThrow();
    });
});

it("rolls back a write that would exceed the current-record quota", async () => {
    await runInDurableObject(ownerStub(), async (_instance, state) => {
        state.storage.sql.exec(
            "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<20000) INSERT INTO graph_nodes SELECT 'n'||x,'Node','','[]',?,0 FROM n",
            crypto.randomUUID(),
        );
        expect(() =>
            graphOperation(
                state.storage,
                "write",
                graphWriteSchema.parse({ nodes: [nodes[0]] }),
                0,
            ),
        ).toThrow("quota_exceeded");
        expect(
            state.storage.sql
                .exec("SELECT COUNT(*) AS count FROM graph_nodes")
                .one().count,
        ).toBe(20000);
        expect(
            state.storage.sql
                .exec(
                    "SELECT COUNT(*) AS count FROM graph_fts WHERE graph_fts MATCH 'hiking'",
                )
                .one().count,
        ).toBe(0);
    });
});
