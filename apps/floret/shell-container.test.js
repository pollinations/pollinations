import assert from "node:assert/strict";
import test from "node:test";
import { createShellOutbound } from "./shell-bridge.js";

function authFetch(valid = true) {
    return async (_url, init) => {
        assert.equal(init.redirect, "error");
        assert.ok(init.signal instanceof AbortSignal);
        return new Response(JSON.stringify({ valid }), {
            status: 200,
            headers: { "Content-Length": "14" },
        });
    };
}

function shellRequest(body = new Uint8Array([0, 0, 0, 1, 123])) {
    return new Request("http://floret-shell.internal/run", {
        method: "POST",
        headers: {
            Authorization: "Bearer ag_test",
            "Content-Type": "application/octet-stream",
            "Content-Length": String(body.byteLength),
        },
        body,
        duplex: "half",
    });
}

function container(response = new Response("result")) {
    return {
        starts: 0,
        fetches: 0,
        destroys: 0,
        forwarded: null,
        async startAndWaitForPorts() {
            this.starts += 1;
        },
        async fetch(request) {
            this.fetches += 1;
            this.forwarded = request;
            return response;
        },
        async destroy() {
            this.destroys += 1;
        },
    };
}

test("invalid auth allocates no shell container", async () => {
    let allocations = 0;
    const outbound = createShellOutbound({
        fetchImpl: authFetch(false),
        getContainerImpl: () => {
            allocations += 1;
        },
    });
    assert.equal((await outbound(shellRequest(), {})).status, 401);
    assert.equal(allocations, 0);
});

test("fresh container receives binary body without bearer and is destroyed", async () => {
    const instance = container(
        new Response(new Uint8Array([0, 0, 0, 2, 123, 125]), {
            headers: { "Content-Type": "application/octet-stream" },
        }),
    );
    const names = [];
    const outbound = createShellOutbound({
        fetchImpl: authFetch(),
        uuidImpl: () => "unique-run",
        getContainerImpl: (_namespace, name) => {
            names.push(name);
            return instance;
        },
    });
    const response = await outbound(shellRequest(), { FLORET_SHELL: {} });
    assert.equal(response.status, 200);
    assert.equal(instance.destroys, 0);
    await response.arrayBuffer();
    assert.deepEqual(names, ["unique-run"]);
    assert.equal(instance.starts, 1);
    assert.equal(instance.fetches, 1);
    assert.equal(instance.destroys, 1);
    assert.equal(instance.forwarded.headers.has("Authorization"), false);
    assert.equal(
        instance.forwarded.headers.get("Content-Length"),
        String(new Uint8Array([0, 0, 0, 1, 123]).byteLength),
    );
    assert.equal(
        instance.forwarded.headers.get("Content-Type"),
        "application/octet-stream",
    );
});

test("container startup, request, and error response paths always destroy", async (t) => {
    await t.test("startup", async () => {
        const instance = container();
        instance.startAndWaitForPorts = async () => {
            throw new Error("start failed");
        };
        const outbound = createShellOutbound({
            fetchImpl: authFetch(),
            getContainerImpl: () => instance,
        });
        assert.equal(
            (await outbound(shellRequest(), { FLORET_SHELL: {} })).status,
            502,
        );
        assert.equal(instance.destroys, 1);
    });

    await t.test("fetch", async () => {
        const instance = container();
        instance.fetch = async () => {
            throw new Error("fetch failed");
        };
        const outbound = createShellOutbound({
            fetchImpl: authFetch(),
            getContainerImpl: () => instance,
        });
        assert.equal(
            (await outbound(shellRequest(), { FLORET_SHELL: {} })).status,
            502,
        );
        assert.equal(instance.destroys, 1);
    });

    await t.test("invalid archive", async () => {
        const instance = container(
            new Response("bad archive", { status: 400 }),
        );
        const outbound = createShellOutbound({
            fetchImpl: authFetch(),
            getContainerImpl: () => instance,
        });
        const response = await outbound(shellRequest(), { FLORET_SHELL: {} });
        assert.equal(response.status, 400);
        assert.equal(instance.destroys, 1);
        assert.match(await response.text(), /bad archive/);
    });
});

test("response cancellation and stream errors destroy exactly once", async (t) => {
    await t.test("cancel", async () => {
        const instance = container(
            new Response(
                new ReadableStream({
                    pull() {},
                    cancel() {
                        throw new Error("upstream cancel failed");
                    },
                }),
            ),
        );
        const outbound = createShellOutbound({
            fetchImpl: authFetch(),
            getContainerImpl: () => instance,
        });
        const response = await outbound(shellRequest(), { FLORET_SHELL: {} });
        await response.body.cancel().catch(() => {});
        assert.equal(instance.destroys, 1);
    });

    await t.test("error", async () => {
        const instance = container(
            new Response(
                new ReadableStream({
                    pull(controller) {
                        controller.error(new Error("upstream failed"));
                    },
                }),
            ),
        );
        const outbound = createShellOutbound({
            fetchImpl: authFetch(),
            getContainerImpl: () => instance,
        });
        const response = await outbound(shellRequest(), { FLORET_SHELL: {} });
        await assert.rejects(response.arrayBuffer(), /upstream failed/);
        assert.equal(instance.destroys, 1);
    });
});

test("abort during startup destroys without forwarding", async () => {
    const abort = new AbortController();
    const original = shellRequest();
    const request = new Request(original, { signal: abort.signal });
    const instance = container();
    instance.startAndWaitForPorts = async ({ cancellationOptions }) => {
        abort.abort();
        assert.equal(cancellationOptions.abort.aborted, true);
    };
    const outbound = createShellOutbound({
        fetchImpl: authFetch(),
        getContainerImpl: () => instance,
    });
    assert.equal((await outbound(request, { FLORET_SHELL: {} })).status, 502);
    assert.equal(instance.fetches, 0);
    assert.equal(instance.destroys, 1);
});

test("already-aborted request allocates no shell container", async () => {
    let allocations = 0;
    const abort = new AbortController();
    abort.abort();
    const outbound = createShellOutbound({
        fetchImpl: authFetch(),
        getContainerImpl: () => {
            allocations += 1;
        },
    });
    const original = shellRequest();
    const aborted = new Request(original, { signal: abort.signal });
    assert.equal((await outbound(aborted, {})).status, 499);
    assert.equal(allocations, 0);
});

test("request size is bounded before auth or allocation", async () => {
    let authCalls = 0;
    let allocations = 0;
    const outbound = createShellOutbound({
        fetchImpl: async () => {
            authCalls += 1;
        },
        getContainerImpl: () => {
            allocations += 1;
        },
    });
    const request = shellRequest();
    request.headers.set("Content-Length", String(103 * 1024 * 1024));
    assert.equal((await outbound(request, {})).status, 413);
    assert.equal(authCalls, 0);
    assert.equal(allocations, 0);
});
