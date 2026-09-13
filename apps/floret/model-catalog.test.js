import assert from "node:assert/strict";
import test from "node:test";
import {
    compareCatalogs,
    FloretCatalogCore,
    normalizeCatalog,
    validateCatalog,
} from "./model-catalog.js";

function model(name, overrides = {}) {
    return {
        name,
        category: "text",
        title: name,
        publisher: "publisher",
        community: false,
        aliases: [],
        pricing: { currency: "pollen", promptTextTokens: "1" },
        capabilities: ["tool_calling"],
        ...overrides,
    };
}

class Storage {
    constructor() {
        this.data = new Map();
        this.alarm = null;
        this.transactionTail = Promise.resolve();
    }
    async get(key) {
        return structuredClone(this.data.get(key));
    }
    async delete(key) {
        this.data.delete(key);
    }
    async put(key, value) {
        if (typeof key === "object") {
            for (const [entryKey, entryValue] of Object.entries(key)) {
                this.data.set(entryKey, structuredClone(entryValue));
            }
            return;
        }
        this.data.set(key, structuredClone(value));
    }
    async transaction(callback) {
        const previous = this.transactionTail;
        let release;
        this.transactionTail = new Promise((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            return await callback(this);
        } finally {
            release();
        }
    }
    async getAlarm() {
        return this.alarm;
    }
    async setAlarm(value) {
        this.alarm = value;
    }
}

function authority(storage = new Storage()) {
    const initialization = [];
    const instance = new FloretCatalogCore(
        {
            storage,
            blockConcurrencyWhile(task) {
                initialization.push(task());
            },
            waitUntil() {},
        },
        {},
    );
    return { instance, storage, initialized: Promise.all(initialization) };
}

function catalogResponse(catalog, status = 200) {
    return new Response(JSON.stringify(catalog), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function reviewResponse(recommendations, quest = []) {
    return Response.json({
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        choices: [
            {
                message: {
                    content: JSON.stringify({
                        recommendations,
                        quest: { recommendations: quest },
                    }),
                },
            },
        ],
    });
}

const promote = (model) => ({
    model,
    action: "promote",
    reason: "Compatible public metadata; quality remains unmeasured.",
});

test("validates, normalizes, and semantically diffs public metadata", () => {
    const raw = validateCatalog([
        model("b", { description: "ignored presentation copy" }),
        model("a"),
    ]);
    const normalized = normalizeCatalog(raw);
    assert.deepEqual(
        normalized.map(({ name, quality }) => ({ name, quality })),
        [
            { name: "a", quality: "UNKNOWN" },
            { name: "b", quality: "UNKNOWN" },
        ],
    );
    assert.equal(normalized[1].description, "ignored presentation copy");

    const changed = normalizeCatalog([
        model("a", {
            pricing: { currency: "pollen", promptTextTokens: "2" },
        }),
        model("c"),
    ]);
    const comparison = compareCatalogs(normalized, changed);
    assert.deepEqual(
        comparison.added.map(({ name }) => name),
        ["c"],
    );
    assert.deepEqual(
        comparison.changed.map(({ name }) => name),
        ["a"],
    );
    assert.deepEqual(
        comparison.removed.map(({ name }) => name),
        ["b"],
    );
});

test("rejects malformed or empty catalogs", () => {
    assert.throws(() => validateCatalog([]), /non-empty/);
    assert.throws(() => validateCatalog([model("a"), model("a")]), /unique/);
    assert.throws(
        () => validateCatalog([{ name: "a" }]),
        /invalid public metadata/,
    );
    assert.throws(
        () => validateCatalog([model("a", { category: "" })]),
        /invalid public metadata/,
    );
    assert.doesNotThrow(() =>
        validateCatalog([
            model("a", {
                category: "future-modality",
                capabilities: ["future-capability"],
            }),
        ]),
    );
    assert.throws(
        () => validateCatalog([model("a", { capabilities: [{}] })]),
        /invalid public metadata/,
    );
    assert.throws(
        () => validateCatalog([model("a", { pricing: [] })]),
        /invalid public metadata/,
    );
    assert.throws(
        () => validateCatalog([model("a", { paid_only: "false" })]),
        /invalid public metadata/,
    );
});

test("concurrent refreshes allocate distinct immutable revisions", async () => {
    const { instance, storage } = authority();
    await instance.refresh(() =>
        Promise.resolve(catalogResponse([model("base")])),
    );
    let releaseFirst;
    const firstWaiting = new Promise((resolve) => {
        releaseFirst = resolve;
    });
    let firstStarted;
    const started = new Promise((resolve) => {
        firstStarted = resolve;
    });
    const first = instance.refresh(async () => {
        firstStarted();
        await firstWaiting;
        return catalogResponse([model("first")]);
    });
    await started;
    const second = instance.refresh(() =>
        Promise.resolve(catalogResponse([model("second")])),
    );
    await new Promise((resolve) => setImmediate(resolve));
    releaseFirst();
    const revisions = await Promise.all([first, second]);
    assert.deepEqual(revisions.map(({ revision }) => revision).sort(), [2, 3]);
    assert.equal((await storage.get("revision:2")).revision, 2);
    assert.equal((await storage.get("revision:3")).revision, 3);
});

test("refresh persists immutable revisions and keeps last good on failure", async () => {
    const { instance, storage, initialized } = authority();
    await initialized;
    const first = await instance.refresh(() =>
        Promise.resolve(catalogResponse([model("a")])),
    );
    assert.equal(first.revision, 1);
    const revisionOne = await storage.get("revision:1");

    const failed = await instance.refresh(() =>
        Promise.resolve(catalogResponse([], 200)),
    );
    assert.equal(failed.revision, 1);
    assert.match(failed.lastError.message, /non-empty/);
    assert.deepEqual(await storage.get("revision:1"), revisionOne);

    const unchanged = await instance.refresh(() =>
        Promise.resolve(catalogResponse([model("a")])),
    );
    assert.equal(unchanged.revision, 1);
    assert.equal(unchanged.lastError, null);
    assert.ok(storage.alarm !== null);
});

test("snapshot is a Python-ready raw catalog payload", async () => {
    const { instance } = authority();
    await instance.refresh(() =>
        Promise.resolve(
            catalogResponse([
                model("candidate", {
                    publisher: "exact-publisher",
                    extra: "kept",
                }),
            ]),
        ),
    );
    const snapshot = await instance.snapshot();
    assert.equal(snapshot.version, "1");
    assert.equal(snapshot.catalog[0].publisher, "exact-publisher");
    assert.equal(snapshot.catalog[0].extra, "kept");
    assert.equal(snapshot.review.catalogRevision, "1");
    assert.deepEqual(snapshot.review.incumbents, []);
});

test("promoted incumbent survives an unrelated catalog revision", async () => {
    const { instance } = authority();
    await instance.refresh(() =>
        Promise.resolve(
            catalogResponse([
                model("A", { category: "image" }),
                model("B", { category: "image" }),
            ]),
        ),
    );
    const reviewResult = await instance.review("key", async () =>
        reviewResponse([promote("B")]),
    );
    assert.equal(reviewResult.status, "complete");
    assert.deepEqual((await instance.snapshot()).review.incumbents, [
        { task_family: "image.general", model: "B" },
    ]);

    await instance.refresh(() =>
        Promise.resolve(
            catalogResponse([
                model("A", { category: "image" }),
                model("B", { category: "image" }),
                model("unrelated", { category: "text" }),
            ]),
        ),
    );
    const snapshot = await instance.snapshot();
    assert.deepEqual(snapshot.review.incumbents, [
        { task_family: "image.general", model: "B" },
    ]);
    assert.equal(snapshot.catalog.find(({ name }) => name === "B").name, "B");
});

test("one shared review selects distinct all and Quest incumbents", async () => {
    const { instance, storage } = authority();
    await instance.refresh(async () =>
        catalogResponse([
            model("paid-winner", { paid_only: true }),
            model("quest-winner", { paid_only: false }),
        ]),
    );
    let calls = 0;
    const reviewed = await instance.review(
        "caller-key",
        async (_url, request) => {
            calls++;
            const body = JSON.parse(request.body);
            assert.match(body.messages[0].content, /quest/);
            assert.match(body.messages[0].content, /paid_only/);
            assert.deepEqual(
                JSON.parse(body.messages[1].content)
                    .map(({ name }) => name)
                    .sort(),
                ["paid-winner", "quest-winner"],
            );
            return reviewResponse(
                [promote("paid-winner")],
                [promote("quest-winner")],
            );
        },
    );
    assert.equal(reviewed.status, "complete");
    assert.equal(calls, 1);
    const snapshot = await instance.snapshot();
    assert.deepEqual(snapshot.review.incumbents, [
        { task_family: "text.general", model: "paid-winner" },
    ]);
    assert.deepEqual(snapshot.review.quest.incumbents, [
        { task_family: "text.general", model: "quest-winner" },
    ]);
    assert.equal(snapshot.review.quest.catalogRevision, "1");
    assert.equal(snapshot.review.quest.revision, "1");
    assert.doesNotMatch(JSON.stringify(snapshot.review.quest), /paid-winner/);
    assert.equal(snapshot.catalog.length, 2);
    assert.doesNotMatch(
        JSON.stringify([...storage.data.entries()]),
        /caller-key/,
    );

    // Request-local consumers cannot mutate either shared view.
    snapshot.review.quest.incumbents[0].model = "paid-winner";
    assert.equal(
        (await instance.snapshot()).review.quest.incumbents[0].model,
        "quest-winner",
    );
});

test("Quest review does not expose paid names embedded in advisory explanations", async () => {
    const { instance } = authority();
    await instance.refresh(async () =>
        catalogResponse([
            model("paid-secret-name", { paid_only: true }),
            model("quest", { paid_only: false }),
        ]),
    );
    const result = await instance.review("key", async () =>
        reviewResponse(
            [promote("paid-secret-name")],
            [
                {
                    ...promote("quest"),
                    reason: "Cheaper than paid-secret-name (also known as paid-secret-alias).",
                },
            ],
        ),
    );
    assert.equal(result.status, "complete");
    assert.doesNotMatch(
        JSON.stringify((await instance.snapshot()).review.quest),
        /paid-secret/,
    );
});

test("existing all-only snapshot gains Quest review without changing public catalog", async () => {
    const { instance, storage } = authority();
    const catalog = [model("quest", { paid_only: false })];
    await instance.refresh(async () => catalogResponse(catalog));
    const old = await storage.get("current");
    delete old.advisoryReview.quest;
    await storage.put("current", old);
    await storage.put("review:1", { status: "complete", attempts: 1 });
    const refreshed = await instance.refresh(async () =>
        catalogResponse(catalog),
    );
    assert.equal(refreshed.revision, 2);
    assert.deepEqual(refreshed.rawCatalog, catalog);
    assert.deepEqual(refreshed.advisoryReview.quest.incumbents, []);
    const result = await instance.review("key", async (_url, request) => {
        assert.equal(
            JSON.parse(JSON.parse(request.body).messages[1].content)[0].name,
            "quest",
        );
        return reviewResponse([promote("quest")], [promote("quest")]);
    });
    assert.equal(result.status, "complete");
    assert.equal(
        (await instance.snapshot()).review.quest.incumbents[0].model,
        "quest",
    );
    assert.equal(
        (await instance.refresh(async () => catalogResponse(catalog))).revision,
        2,
    );
});

test("Quest review rejects paid recommendations even when zero-priced", async () => {
    const { instance } = authority();
    await instance.refresh(async () =>
        catalogResponse([
            model("paid", {
                paid_only: true,
                pricing: { currency: "pollen", promptTextTokens: "0" },
            }),
            model("quest", { paid_only: false }),
        ]),
    );
    const reviewed = await instance.review("caller-key", async () =>
        reviewResponse([promote("paid")], [promote("paid")]),
    );
    assert.equal(reviewed.status, "failed");
    assert.match(reviewed.reason, /invalid JSON/);
    assert.deepEqual(
        (await instance.snapshot()).review.quest.recommendations,
        [],
    );
});

test("omitted paid_only follows the Quest-eligible access default", async () => {
    const { instance } = authority();
    await instance.refresh(async () =>
        catalogResponse([model("eligible-by-default")]),
    );
    const result = await instance.review("key", async () =>
        reviewResponse(
            [promote("eligible-by-default")],
            [promote("eligible-by-default")],
        ),
    );
    assert.equal(result.status, "complete");
    assert.deepEqual((await instance.snapshot()).review.quest.incumbents, [
        { task_family: "text.general", model: "eligible-by-default" },
    ]);
});

test("an empty Quest pool remains empty without blocking the all-model review", async () => {
    const { instance } = authority();
    await instance.refresh(async () =>
        catalogResponse([model("paid", { paid_only: true })]),
    );
    const result = await instance.review("key", async () =>
        reviewResponse([promote("paid")]),
    );
    assert.equal(result.status, "complete");
    const snapshot = await instance.snapshot();
    assert.deepEqual(snapshot.review.incumbents, [
        { task_family: "text.general", model: "paid" },
    ]);
    assert.deepEqual(snapshot.review.quest.incumbents, []);
    assert.deepEqual(snapshot.review.quest.recommendations, []);
});

test("Quest incumbents persist independently and disappear after paid-only reclassification", async () => {
    const { instance, storage } = authority();
    const first = [
        model("paid", { paid_only: true }),
        model("quest", { paid_only: false }),
    ];
    await instance.refresh(async () => catalogResponse(first));
    await instance.review("key", async () =>
        reviewResponse([promote("paid")], [promote("quest")]),
    );
    await instance.refresh(async () =>
        catalogResponse([
            ...first,
            model("image", { category: "image", paid_only: false }),
        ]),
    );
    const second = await instance.snapshot();
    assert.deepEqual(second.review.incumbents, [
        { task_family: "text.general", model: "paid" },
    ]);
    assert.deepEqual(second.review.quest.incumbents, [
        { task_family: "text.general", model: "quest" },
    ]);
    assert.equal(second.review.quest.catalogRevision, "2");
    await instance.refresh(async () =>
        catalogResponse([
            model("paid", { paid_only: true }),
            model("quest", { paid_only: true }),
        ]),
    );
    assert.deepEqual((await instance.snapshot()).review.quest.incumbents, []);
    assert.equal(
        (await storage.get("revision:2")).advisoryReview.quest.incumbents[0]
            .model,
        "quest",
    );
});

test("bounded advisory input retains Quest candidates beside a large paid text catalog", async () => {
    const { instance } = authority();
    await instance.refresh(async () =>
        catalogResponse([
            ...Array.from({ length: 100 }, (_, index) =>
                model(`paid-${index}`, {
                    paid_only: true,
                    description: "p".repeat(256),
                    context_length: 128_000,
                }),
            ),
            model("zz-quest", { paid_only: false }),
            model("zz-quest-image", { category: "image", paid_only: false }),
        ]),
    );
    const result = await instance.review("key", async (_url, request) => {
        const input = JSON.parse(request.body).messages[1].content;
        assert.ok(input.length <= 32_000);
        const candidates = JSON.parse(input);
        assert.ok(candidates.some(({ name }) => name === "zz-quest"));
        assert.ok(candidates.some(({ name }) => name === "zz-quest-image"));
        return reviewResponse(
            [],
            [promote("zz-quest"), promote("zz-quest-image")],
        );
    });
    assert.equal(result.status, "complete");
});

test("review is skipped without a caller key and never stores the key", async () => {
    const { instance, storage } = authority();
    await instance.refresh(() =>
        Promise.resolve(catalogResponse([model("candidate")])),
    );
    let calls = 0;
    const result = await instance.review(undefined, async () => {
        calls += 1;
        throw new Error("must not fetch");
    });
    assert.deepEqual(result, {
        status: "skipped",
        reason: "missing caller credential",
    });
    assert.equal(calls, 0);
    assert.doesNotMatch(
        JSON.stringify([...storage.data.entries()]),
        /secret-key/,
    );
});

test("concurrent review calls produce one lease and one advisory request", async () => {
    const { instance, storage } = authority();
    await instance.refresh(() =>
        Promise.resolve(catalogResponse([model("candidate")])),
    );
    let calls = 0;
    let release;
    const waiting = new Promise((resolve) => {
        release = resolve;
    });
    const reviewFetch = async (_url, request) => {
        calls += 1;
        assert.equal(request.headers.authorization, "Bearer caller-key");
        assert.equal(request.redirect, "manual");
        const requestBody = JSON.parse(request.body);
        assert.doesNotThrow(() => JSON.parse(requestBody.messages[1].content));
        await waiting;
        return reviewResponse([promote("candidate")]);
    };
    const first = instance.review("caller-key", reviewFetch);
    await new Promise((resolve) => setImmediate(resolve));
    const second = await instance.review("caller-key", reviewFetch);
    release();
    assert.equal((await first).status, "complete");
    assert.equal(second.status, "skipped");
    assert.equal(calls, 1);
    assert.doesNotMatch(
        JSON.stringify([...storage.data.entries()]),
        /caller-key/,
    );
});

test("review result is discarded when catalog changes in flight", async () => {
    const { instance } = authority();
    await instance.refresh(() =>
        Promise.resolve(catalogResponse([model("candidate")])),
    );
    let release;
    const waiting = new Promise((resolve) => {
        release = resolve;
    });
    let started;
    const reviewStarted = new Promise((resolve) => {
        started = resolve;
    });
    const review = instance.review("key", async () => {
        started();
        await waiting;
        return reviewResponse([]);
    });
    await reviewStarted;
    await instance.refresh(() =>
        Promise.resolve(catalogResponse([model("replacement")])),
    );
    release();
    assert.deepEqual(await review, {
        status: "discarded",
        reason: "catalog revision changed",
    });
    assert.deepEqual((await instance.snapshot()).review.recommendations, []);
});

test("failed reviews have a finite two-attempt cap and cooldown", async () => {
    const { instance, storage } = authority();
    await instance.refresh(() =>
        Promise.resolve(catalogResponse([model("candidate")])),
    );
    let calls = 0;
    const fail = async () => {
        calls += 1;
        return new Response("denied", { status: 401 });
    };
    assert.equal((await instance.review("key", fail)).status, "failed");
    assert.equal((await instance.review("key", fail)).status, "skipped");
    const lease = await storage.get("review:1");
    await storage.put("review:1", { ...lease, retryAt: 0 });
    assert.equal((await instance.review("key", fail)).status, "failed");
    const capped = await storage.get("review:1");
    await storage.put("review:1", { ...capped, retryAt: 0 });
    assert.equal((await instance.review("key", fail)).status, "skipped");
    assert.equal(calls, 2);
});
