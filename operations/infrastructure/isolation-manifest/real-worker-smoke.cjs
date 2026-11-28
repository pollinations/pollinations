// Local-only smoke test of already-built application Workers. The test creates
// no cloud resources, uses no Wrangler configuration, and denies external fetch.
const assert = require("node:assert/strict");
const { readdirSync } = require("node:fs");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const test = require("node:test");
const { createPlan } = require("./manifest.cjs");

const { Miniflare, convertV4MiniflareOptions } = createRequire(
    require.resolve("wrangler"),
)("miniflare");
const root = resolve(__dirname, "../../..");

function bundledModules(directory) {
    return [
        "index.js",
        ...readdirSync(resolve(directory, "assets"))
            .filter((name) => name.endsWith(".js"))
            .map((name) => `assets/${name}`),
    ].map((path) => ({ type: "ESModule", path: resolve(directory, path) }));
}

function workerOptions(plan) {
    return plan.environments.flatMap(({ slot, workers }) =>
        Object.entries(workers).map(([role, worker]) => {
            const name = (value) => `${slot}-${value}`;
            const scoped = (bindings) =>
                Object.fromEntries(
                    Object.entries(bindings).map(([key, value]) => [
                        key,
                        name(value),
                    ]),
                );
            const directory = resolve(
                root,
                `${role}.pollinations.ai/dist/pollinations_${role}`,
            );
            return {
                name: name(role),
                modulesRoot: directory,
                modules: bundledModules(directory),
                compatibilityDate: "2025-11-01",
                compatibilityFlags: [
                    "nodejs_compat",
                    "nodejs_als",
                    "global_fetch_strictly_public",
                    "unhandled_rejection_after_microtask_checkpoint",
                ],
                bindings: {
                    ENVIRONMENT: "local",
                    LOG_LEVEL: "error",
                    LOG_FORMAT: "text",
                },
                d1Databases: { DB: name(worker.d1) },
                kvNamespaces: scoped(worker.kv),
                r2Buckets: scoped(worker.r2 ?? {}),
                serviceBindings: scoped(worker.services),
                durableObjects: worker.durableObjects ?? {},
                outboundService: () =>
                    new Response(
                        "External access disabled in local smoke test",
                        {
                            status: 503,
                        },
                    ),
            };
        }),
    );
}

test("built Enter and Gen run in two separate local slots", async (t) => {
    const mf = new Miniflare(
        convertV4MiniflareOptions({
            host: "127.0.0.1",
            workers: workerOptions(createPlan()),
        }),
    );
    t.after(() => mf.dispose());

    for (const slot of ["pilot-a", "pilot-b"]) {
        const enter = await mf.getWorker(`${slot}-enter`);
        const gen = await mf.getWorker(`${slot}-gen`);
        const health = await enter.fetch("http://local.test/api/auth/ok");
        assert.equal(health.status, 200);
        assert.deepEqual(await health.json(), { ok: true });
        // Gen's /account/* route forwards to Enter over the service binding.
        const balance = await gen.fetch("http://local.test/account/balance");
        assert.equal(balance.status, 401);
    }

    const a = await mf.getD1Database("DB", "pilot-a-enter");
    const aFromGen = await mf.getD1Database("DB", "pilot-a-gen");
    const b = await mf.getD1Database("DB", "pilot-b-enter");
    await a.exec("CREATE TABLE isolation_smoke (value TEXT)");
    await a.prepare("INSERT INTO isolation_smoke VALUES (?)").bind("a").run();
    assert.equal(
        await aFromGen
            .prepare("SELECT value FROM isolation_smoke")
            .first("value"),
        "a",
    );
    const table = await b
        .prepare("SELECT name FROM sqlite_master WHERE name = ?")
        .bind("isolation_smoke")
        .first();
    assert.equal(table, null);
});
