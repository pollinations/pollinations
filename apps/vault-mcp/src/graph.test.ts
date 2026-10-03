import { expect, it } from "vitest";
import { call } from "./test-client";

it("keeps requested nodes readable when evidence or history exceeds the response budget", async () => {
    const leaf = { id: "leaf", name: "Leaf" };
    const root = { id: "root", name: "Root", text: "記".repeat(4096) };
    await call("write", { idempotencyKey: "nodes", nodes: [root, leaf] });
    for (let batch = 0; batch < 2; batch++) {
        const written = await call("write", {
            idempotencyKey: `edges-${batch}`,
            relations: Array.from({ length: 16 }, (_, i) => ({
                id: `edge-${batch}-${i}`,
                subject: "root",
                predicate: "links",
                target: "leaf",
                evidence: "e".repeat(2048),
            })),
        });
        expect(written.error).toBeUndefined();
    }
    const evidence = await call("read", { ids: ["root", "leaf"] });
    expect(evidence.data?.nodes).toHaveLength(2);
    expect(evidence.data?.truncated).toBe(true);
    expect(evidence.data?.omissions).toContainEqual({
        id: "root",
        kind: "relations",
    });
    expect(
        new TextEncoder().encode(JSON.stringify(evidence.data)).length,
    ).toBeLessThan(65_536);
    for (let version = 1; version <= 6; version++) {
        await call("write", {
            idempotencyKey: `revision-${version}`,
            nodes: [{ ...leaf, text: root.text, expectedVersion: version }],
        });
    }
    const history = await call("read", { ids: ["leaf"], includeHistory: true });
    expect(history.data?.nodes).toHaveLength(1);
    expect(history.data?.omissions).toContainEqual({
        id: "leaf",
        kind: "history",
    });
    expect(
        new TextEncoder().encode(JSON.stringify(history.data)).length,
    ).toBeLessThan(65_536);
});

const nodes = [
    { id: "user", name: "User", text: "likes hiking", aliases: ["me"] },
    { id: "project", name: "Orchid", text: "garden project" },
];
it("shares one graph between authorized agents but never between users", async () => {
    const written = await call("write", {
        idempotencyKey: "first",
        nodes,
        relations: [
            {
                id: "owns",
                subject: "user",
                predicate: "owns",
                target: "project",
                evidence: "I own Orchid",
            },
        ],
    });
    expect(written.result?.isError, JSON.stringify(written)).not.toBe(true);
    expect(written.data?.head).toBe(1);
    const read = await call(
        "read",
        { ids: ["user"] },
        "hive-owner",
        "different-model",
    );
    expect(read.data?.nodes).toHaveLength(1);
    expect(read.data?.relations).toHaveLength(1);
    const other = await call("read", { ids: ["user"] }, "other-owner");
    expect(other.data?.nodes).toEqual([]);
    const found = await call("search", { query: "garden" });
    expect(found.data?.nodes).toHaveLength(1);
    const alias = await call("search", { query: "me" });
    expect(alias.data?.nodes).toHaveLength(1);
});
it("retries once, rejects conflicts, and rolls back dangling batches", async () => {
    const input = { idempotencyKey: "once", nodes };
    const first = await call("write", input);
    const retry = await call("write", input);
    expect(retry.data).toEqual(first.data);
    expect(
        (await call("write", { ...input, nodes: [{ id: "x", name: "X" }] }))
            .error,
    ).toBe("idempotency_conflict");
    expect(
        (
            await call("write", {
                idempotencyKey: "bad",
                nodes: [{ id: "rolled-back", name: "Oops" }],
                relations: [
                    {
                        id: "bad",
                        subject: "rolled-back",
                        predicate: "owns",
                        target: "missing",
                        evidence: "test",
                    },
                ],
            })
        ).error,
    ).toBe("not_found");
    expect((await call("read", { ids: ["rolled-back"] })).data?.nodes).toEqual(
        [],
    );
});
it("supports shared corrections with version conflicts, exact counts and head-bound paging", async () => {
    await call("write", {
        idempotencyKey: "seed",
        nodes,
        relations: [
            {
                id: "owns",
                subject: "user",
                predicate: "owns",
                target: "project",
                evidence: "I own Orchid",
            },
        ],
    });
    expect(
        (await call("search", { mode: "count", predicate: "owns" })).data
            ?.count,
    ).toBe(1);
    const page = await call("search", { limit: 1 });
    expect(page.data?.nextCursor).toBeTruthy();
    const updated = await call(
        "write",
        {
            idempotencyKey: "edit",
            nodes: [
                {
                    id: "project",
                    name: "Orchid",
                    text: "updated garden",
                    expectedVersion: 1,
                },
            ],
        },
        "hive-owner",
        "agent-b",
    );
    expect(updated.data?.head).toBe(2);
    expect(
        (
            await call("write", {
                idempotencyKey: "stale",
                nodes: [{ id: "project", name: "Wrong", expectedVersion: 1 }],
            })
        ).error,
    ).toBe("version_conflict");
    expect(
        (await call("search", { limit: 1, cursor: page.data?.nextCursor }))
            .error,
    ).toBe("restart_required");
    await call("write", {
        idempotencyKey: "retract",
        relations: [
            {
                id: "owns",
                subject: "user",
                predicate: "owns",
                target: "project",
                evidence: "no longer owns",
                status: "retracted",
                expectedVersion: 1,
            },
        ],
    });
    expect(
        (await call("search", { mode: "count", predicate: "owns" })).data
            ?.count,
    ).toBe(0);
});
it("denies missing graph scopes and rejects caller-selected identity and oversized inputs", async () => {
    expect(
        (
            await call(
                "write",
                { idempotencyKey: "denied", nodes },
                "hive-owner",
                "agent",
                ["read"],
            )
        ).result?.isError,
    ).toBe(true);
    expect(
        (
            await call("write", {
                idempotencyKey: "identity",
                nodes,
                owner: "someone",
            })
        ).data,
    ).toBeUndefined();
    expect(
        (await call("search", { query: '" OR *' })).result?.isError,
    ).not.toBe(true);
    expect(
        (
            await call("write", {
                idempotencyKey: "big",
                nodes: [{ id: "x", name: "x", text: "x".repeat(5000) }],
            })
        ).data,
    ).toBeUndefined();
});

it("shares managed-agent writes and arbitrates simultaneous corrections", async () => {
    await call("write", { idempotencyKey: "seed", nodes });
    const updates = await Promise.all(
        ["one", "two"].map((name) =>
            call(
                "write",
                {
                    idempotencyKey: name,
                    nodes: [{ id: "project", name, expectedVersion: 1 }],
                },
                "hive-owner",
                name,
                ["write", "search", "read"],
            ),
        ),
    );
    expect(updates.filter((v) => v.data)).toHaveLength(1);
    expect(updates.filter((v) => v.error === "version_conflict")).toHaveLength(
        1,
    );
    const result = await call("read", {
        ids: ["project"],
        includeHistory: true,
    });
    expect(result.data?.head).toBe(2);
    expect(result.data?.history).toHaveLength(2);
    expect((result.data?.nodes as { version: number }[])[0]?.version).toBe(2);
});
it("pages without omissions and distinguishes relation and target counts", async () => {
    await call("write", {
        idempotencyKey: "seed",
        nodes,
        relations: [
            {
                id: "r1",
                subject: "user",
                predicate: "owns",
                target: "project",
                evidence: "claim one",
            },
            {
                id: "r2",
                subject: "user",
                predicate: "owns",
                target: "project",
                evidence: "claim two",
            },
        ],
    });
    expect(
        (await call("search", { mode: "count", predicate: "owns" })).data
            ?.count,
    ).toBe(2);
    expect(
        (
            await call("search", {
                mode: "count",
                predicate: "owns",
                countUnit: "targets",
            })
        ).data?.count,
    ).toBe(1);
    const first = await call("search", { limit: 1 });
    const second = await call("search", {
        limit: 1,
        cursor: first.data?.nextCursor,
    });
    expect(second.data?.truncated).toBe(false);
    expect(
        new Set(
            [
                ...(first.data?.nodes as { id: string }[]),
                ...(second.data?.nodes as { id: string }[]),
            ].map((v) => v.id),
        ).size,
    ).toBe(2);
});

it("treats malformed cursors as invalid input and finds exact node IDs", async () => {
    await call("write", {
        idempotencyKey: "id",
        nodes: [{ id: "unique-id", name: "Other" }],
    });
    expect(
        (await call("search", { query: "unique-id" })).data?.nodes,
    ).toHaveLength(1);
    expect((await call("search", { cursor: "%%%" })).error).toBe(
        "invalid_request",
    );
});

it("requires all search terms instead of injecting unrelated context", async () => {
    await call("write", {
        idempotencyKey: "precise",
        nodes: [
            { id: "colleague", name: "Sam", text: "Sam maintains the parser" },
            { id: "cousin", name: "Sam", text: "Sam lives in Rome" },
            {
                id: "meeting",
                name: "Staff meeting",
                text: "Staff meeting starts on Thursday",
            },
            {
                id: "noise",
                name: "Other meeting",
                text: "Routine meeting logs",
            },
        ],
    });
    expect((await call("search", { query: "Sam parser" })).data?.nodes).toEqual(
        [expect.objectContaining({ id: "colleague" })],
    );
    expect(
        (await call("search", { query: "Staff meeting Thursday" })).data?.nodes,
    ).toHaveLength(1);
    const miss = await call("search", { query: "nonexistent parser" });
    expect(miss.data?.nodes).toEqual([]);
    expect(miss.data?.contextStatus).toBe("no_evidence");
    expect(miss.data?.absenceProven).toBe(false);
});
it("uses bounded caller reformulations without inventing semantic matches", async () => {
    await call("write", {
        idempotencyKey: "variants",
        nodes: [
            {
                id: "n1",
                name: "Food limits",
                text: "Avoid almonds",
                aliases: ["diet restrictions"],
            },
            { id: "n2", name: "Coding tools", text: "Rust for automation" },
            {
                id: "noise",
                name: "Admin",
                text: "Procedures for office management",
            },
        ],
    });
    const found = await call("search", {
        query: "What should I avoid eating?",
        queryVariants: ["diet restrictions", "food limits"],
    });
    expect(found.data?.nodes).toEqual([expect.objectContaining({ id: "n1" })]);
    expect(found.data?.retrieval).toMatchObject({
        method: "lexical_graph",
        semanticVerification: false,
    });
    const page = await call("search", {
        queryVariants: ["food", "coding"],
        limit: 1,
    });
    expect(page.data?.truncated).toBe(true);
    expect(
        (
            await call("search", {
                queryVariants: ["food", "coding"],
                limit: 1,
                cursor: page.data?.nextCursor,
            })
        ).data?.nodes,
    ).toHaveLength(1);
    expect(
        (
            await call("search", {
                queryVariants: ["food", "management"],
                limit: 1,
                cursor: page.data?.nextCursor,
            })
        ).error,
    ).toBe("restart_required");
    expect(
        (await call("search", { query: Array(17).fill("food").join(" ") }))
            .error,
    ).toBe("limit_exceeded");
});
it("refuses stale context packets and exposes missing IDs and provenance", async () => {
    await call("write", {
        idempotencyKey: "first",
        nodes: [{ id: "setting", name: "Setting", text: "Value four" }],
    });
    const found = await call("search", { query: "setting" });
    const packet = await call("read", {
        ids: ["setting", "missing"],
        expectedHead: found.data?.head,
    });
    expect(packet.data?.missingIds).toEqual(["missing"]);
    expect(packet.data?.trust).toBe("untrusted_memory");
    expect((packet.data?.nodes as unknown[])[0]).toMatchObject({
        validTime: { kind: "unknown" },
        recordedAt: expect.any(Number),
    });
    await call("write", {
        idempotencyKey: "second",
        nodes: [
            {
                id: "setting",
                name: "Setting",
                text: "Value six",
                expectedVersion: 1,
            },
        ],
    });
    expect(
        (
            await call("read", {
                ids: ["setting"],
                expectedHead: found.data?.head,
            })
        ).error,
    ).toBe("restart_required");
    expect((await call("search", { query: "four" })).data?.nodes).toEqual([]);
    expect((await call("search", { query: "six" })).data?.nodes).toHaveLength(
        1,
    );
});

it("reports omitted graph evidence instead of claiming a complete neighborhood", async () => {
    await call("write", {
        idempotencyKey: "nodes",
        nodes: [
            { id: "root", name: "Root" },
            { id: "leaf", name: "Leaf" },
        ],
    });
    const edges = Array.from({ length: 33 }, (_, i) => ({
        id: `edge-${i}`,
        subject: "root",
        predicate: "linked",
        target: "leaf",
        evidence: `Source statement ${i}`,
    }));
    await call("write", {
        idempotencyKey: "edges-1",
        relations: edges.slice(0, 32),
    });
    await call("write", {
        idempotencyKey: "edges-2",
        relations: edges.slice(32),
    });
    const packet = await call("read", { ids: ["root"] });
    expect(packet.data?.relations).toHaveLength(32);
    expect(packet.data?.truncated).toBe(true);
    expect(packet.data?.omissions).toEqual([{ id: "root", kind: "relations" }]);
});

it("rejects malformed cursor records at the boundary", async () => {
    for (const cursor of [
        null,
        [],
        {},
        { head: 0, offset: -1, digest: "bad" },
    ]) {
        expect(
            (await call("search", { cursor: btoa(JSON.stringify(cursor)) }))
                .error,
        ).toBe("invalid_request");
    }
});

it("discovers relation evidence and supplies its current graph context in one search", async () => {
    await call("write", {
        idempotencyKey: "evidence",
        nodes: [
            { id: "app", name: "Orchid", text: "Application" },
            { id: "host", name: "Platform", text: "Workers deployment" },
        ],
        relations: [
            {
                id: "deployment",
                subject: "app",
                predicate: "runs_on",
                target: "host",
                evidence: "Production release uses the edge runtime",
            },
        ],
    });
    const result = await call("search", { query: "edge runtime", limit: 1 });
    expect(result.data?.nodes).toHaveLength(1);
    expect(result.data?.relations).toEqual([
        expect.objectContaining({
            id: "deployment",
            evidence: "Production release uses the edge runtime",
            version: 1,
        }),
    ]);
    expect(result.data?.linkedNodes).toHaveLength(1);
    expect(result.data?.retrieval).toMatchObject({
        method: "lexical_graph",
        graphDepth: 1,
        semanticVerification: false,
    });
    const next = await call("search", {
        query: "edge runtime",
        limit: 1,
        cursor: result.data?.nextCursor,
    });
    expect(next.data?.nodes).toHaveLength(1);
    expect(next.data?.nodes).not.toEqual(result.data?.nodes);
    expect(
        (await call("search", { query: "edge runtime" }, "other-owner")).data
            ?.nodes,
    ).toEqual([]);
    await call("write", {
        idempotencyKey: "correct-evidence",
        relations: [
            {
                id: "deployment",
                subject: "app",
                predicate: "runs_on",
                target: "host",
                evidence: "Production release uses a container cluster",
                expectedVersion: 1,
            },
        ],
    });
    expect(
        (await call("search", { query: "edge runtime" })).data?.nodes,
    ).toEqual([]);
    expect(
        (await call("search", { query: "container cluster" })).data?.relations,
    ).toEqual([expect.objectContaining({ version: 2 })]);
    expect(
        (
            await call("search", {
                query: "edge runtime",
                limit: 1,
                cursor: result.data?.nextCursor,
            })
        ).error,
    ).toBe("restart_required");
    await call("write", {
        idempotencyKey: "retract-evidence",
        relations: [
            {
                id: "deployment",
                subject: "app",
                predicate: "runs_on",
                target: "host",
                evidence: "Production release uses a container cluster",
                status: "retracted",
                expectedVersion: 2,
            },
        ],
    });
    expect(
        (await call("search", { query: "container cluster" })).data?.nodes,
    ).toEqual([]);
    expect((await call("search", { query: "Orchid" })).data?.relations).toEqual(
        [],
    );
});

it("bounds search neighborhoods and reports omitted evidence without expanding unrelated history", async () => {
    await call("write", {
        idempotencyKey: "context",
        nodes: [
            { id: "root", name: "Central" },
            { id: "leaf", name: "Leaf" },
            { id: "other", name: "Independent" },
        ],
        relations: Array.from({ length: 6 }, (_, i) => ({
            id: `link-${i}`,
            subject: "root",
            predicate: "linked",
            target: "leaf",
            evidence: `Support ${i}`,
        })),
    });
    const result = await call("search", { query: "Central", limit: 1 });
    expect(result.data?.nodes).toEqual([
        expect.objectContaining({ id: "root" }),
    ]);
    expect(result.data?.relations).toHaveLength(4);
    expect(result.data?.linkedNodes).toEqual([
        expect.objectContaining({ id: "leaf" }),
    ]);
    expect(result.data?.contextTruncated).toBe(true);
    expect(result.data?.omissions).toContainEqual({
        id: "root",
        kind: "relations",
    });
    expect(result.data?.nextCursor).toBeNull();
    expect(
        new TextEncoder().encode(JSON.stringify(result.data)).length,
    ).toBeLessThan(65_536);
    const evidence = await call("search", { query: "Support 5", limit: 1 });
    expect(evidence.data?.relations).toContainEqual(
        expect.objectContaining({ id: "link-5" }),
    );
});

it("rolls back relation discovery together with a rejected graph batch", async () => {
    await call("write", { idempotencyKey: "seed", nodes });
    const result = await call("write", {
        idempotencyKey: "rejected",
        relations: [
            {
                id: "rolled-edge",
                subject: "user",
                predicate: "owns",
                target: "project",
                evidence: "Rollback marker",
            },
            {
                id: "invalid-edge",
                subject: "user",
                predicate: "owns",
                target: "absent",
                evidence: "Invalid endpoint",
            },
        ],
    });
    expect(result.error).toBe("not_found");
    expect(
        (await call("search", { query: "Rollback marker" })).data?.nodes,
    ).toEqual([]);
    expect(
        (await call("read", { ids: ["rolled-edge"] })).data?.missingIds,
    ).toEqual(["rolled-edge"]);
});
