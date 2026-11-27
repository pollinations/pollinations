const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const test = require("node:test");
const { createPlan } = require("./manifest.cjs");

// Use Wrangler's locked emulator, not the production Worker entrypoints or
// Wrangler config. No remote bindings, existing data, or environment secrets.
const { Miniflare, convertV4MiniflareOptions } = createRequire(
    require.resolve("wrangler"),
)("miniflare");

const database = `
async function readDb(db) {
    return (await db.prepare("SELECT value FROM marker WHERE id = 1")
        .first("value")) ?? null;
}
`;

const enter = `${database}
export default {
    async fetch(request, env) {
        await env.DB.exec("CREATE TABLE IF NOT EXISTS marker (id INTEGER PRIMARY KEY, value TEXT)");
        if (request.method === "PUT") {
            const value = await request.text();
            await env.DB.prepare("INSERT OR REPLACE INTO marker VALUES (1, ?)")
                .bind(value).run();
            await env.KV.put("marker", value);
        }
        return Response.json({
            db: await readDb(env.DB),
            kv: await env.SETUP_HOLDS.get("marker"),
        });
    },
};
`;

const gen = `${database}
class Marker {
    constructor(state) { this.storage = state.storage; }
    async fetch(request) {
        if (request.method === "PUT") {
            await this.storage.put("marker", await request.text());
        }
        return Response.json((await this.storage.get("marker")) ?? null);
    }
}
export class CommunityModelRateLimiter extends Marker {}
export class GenerationCoordinator extends Marker {}
export class AzurePortWake extends Marker {}

export default {
    async fetch(request, env) {
        const value = request.method === "PUT" ? await request.text() : null;
        const enter = await env.ENTER.fetch("http://enter.invalid/marker", {
            method: request.method,
            body: value,
        });
        if (value !== null) await env.TEXT_BUCKET.put("marker", value);
        const durableObjects = {};
        for (const name of ["CommunityModelRateLimiter", "GenerationCoordinator", "AzurePortWake"]) {
            const namespace = env[name];
            const response = await namespace.get(namespace.idFromName("marker"))
                .fetch("http://object.invalid/marker", { method: request.method, body: value });
            durableObjects[name] = await response.json();
        }
        return Response.json({
            enter: await enter.json(),
            db: await readDb(env.DB),
            kv: await env.KV.get("marker"),
            r2: (await (await env.TEXT_BUCKET.get("marker"))?.text()) ?? null,
            durableObjects,
        });
    },
};
`;

function localWorkers(plan) {
    return plan.environments.flatMap(({ slot, workers }) =>
        Object.entries(workers).map(([role, worker]) => {
            const namespace = (name) => `${slot}-${name}`;
            const scoped = (bindings) =>
                Object.fromEntries(
                    Object.entries(bindings).map(([name, target]) => [
                        name,
                        namespace(target),
                    ]),
                );
            return {
                name: namespace(role),
                modules: true,
                script: role === "enter" ? enter : gen,
                compatibilityDate: "2025-11-01",
                d1Databases: { DB: namespace(worker.d1) },
                kvNamespaces: scoped(worker.kv),
                r2Buckets: scoped(worker.r2 ?? {}),
                serviceBindings: scoped(worker.services),
                durableObjects: Object.fromEntries(
                    (worker.durableObjects ?? []).map((name) => [name, name]),
                ),
            };
        }),
    );
}

const expected = (value) => ({
    enter: { db: value, kv: value },
    db: value,
    kv: value,
    r2: value,
    durableObjects: {
        CommunityModelRateLimiter: value,
        GenerationCoordinator: value,
        AzurePortWake: value,
    },
});

test("local pilot slots share only their own Enter and data bindings", async (t) => {
    const mf = new Miniflare(
        convertV4MiniflareOptions({
            host: "127.0.0.1",
            workers: localWorkers(createPlan()),
        }),
    );
    t.after(() => mf.dispose());
    const a = await mf.getWorker("pilot-a-gen");
    const b = await mf.getWorker("pilot-b-gen");
    const read = async (worker) =>
        (await worker.fetch("http://gen.invalid/marker")).json();
    const write = async (worker, body) =>
        (
            await worker.fetch("http://gen.invalid/marker", {
                method: "PUT",
                body,
            })
        ).json();

    assert.deepEqual(await write(a, "only-a"), expected("only-a"));
    assert.deepEqual(await read(b), expected(null));
    assert.deepEqual(
        await Promise.all([write(a, "new-a"), write(b, "only-b")]),
        [expected("new-a"), expected("only-b")],
    );
    assert.deepEqual(await read(a), expected("new-a"));
    assert.deepEqual(await read(b), expected("only-b"));
});
