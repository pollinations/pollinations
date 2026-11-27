const test = require("node:test");
const assert = require("node:assert/strict");
const { createPlan, validate } = require("./manifest.cjs");

// Synthetic placeholders only: these are not Cloudflare resource IDs or routes.
const fixture = () => ({
    "pilot-a": {
        workers: { enter: "a-enter", gen: "a-gen" },
        d1: "a-db",
        kv: "a-kv",
        r2: "a-text",
        routes: { enter: "enter.a.invalid", gen: "gen.a.invalid" },
    },
    "pilot-b": {
        workers: { enter: "b-enter", gen: "b-gen" },
        d1: "b-db",
        kv: "b-kv",
        r2: "b-text",
        routes: { enter: "enter.b.invalid", gen: "gen.b.invalid" },
    },
});
const copy = (x) => structuredClone(x);
const check = (plan, allocation, reserved = []) =>
    validate(plan, allocation, copy(allocation), reserved);

test("two independent slots and only the intended within-slot bindings", () => {
    const plan = createPlan();
    assert.equal(check(plan, fixture()), true);
    assert.deepEqual(
        plan.environments.map((e) => e.slot),
        ["pilot-a", "pilot-b"],
    );
    for (const env of plan.environments) {
        assert.deepEqual(env.workers.gen.services, { ENTER: "enter" });
        assert.equal(env.workers.enter.d1, env.workers.gen.d1);
        assert.equal(env.workers.enter.kv.KV, env.workers.gen.kv.KV);
        assert.equal(env.workers.enter.kv.SETUP_HOLDS, env.workers.gen.kv.KV);
    }
    plan.environments[0].workers.gen.durableObjects.pop();
    assert.equal(
        createPlan().environments[1].workers.gen.durableObjects.length,
        3,
    );
});

test("reject every cross-slot resource collision and same-slot collisions", () => {
    for (const [group, key] of [
        ["workers", "enter"],
        ["workers", "gen"],
        ["routes", "enter"],
        ["routes", "gen"],
    ]) {
        const a = fixture();
        a["pilot-b"][group][key] = a["pilot-a"][group][key];
        assert.throws(() => check(createPlan(), a), /colliding/);
    }
    for (const key of ["d1", "kv", "r2"]) {
        const a = fixture();
        a["pilot-b"][key] = a["pilot-a"][key];
        assert.throws(() => check(createPlan(), a), /colliding/);
    }
    const a = fixture();
    a["pilot-a"].kv = a["pilot-a"].d1;
    assert.throws(() => check(createPlan(), a), /colliding/);
});

test("reject changed or added branch capabilities and spoofed service targets", () => {
    const mutations = [
        (p) => {
            p.environments[0].workers.gen.services.ENTER = "pilot-b/enter";
        },
        (p) => {
            p.environments[0].workers.gen.services.MEDIA = "production";
        },
        (p) => {
            p.environments[0].workers.gen.vpc = "gpu";
        },
        (p) => {
            p.environments[0].workers.enter.secrets = ["SOPS"];
        },
        (p) => {
            p.environments[0].workers.gen.durableObjects.push("Extra");
        },
        (p) => {
            p.environments[0].workers.enter.kv.KV = "pilot-b/kv";
        },
        (p) => {
            p.environments[0].routes.enter = "gen";
        },
        (p) => {
            p.environments.push(copy(p.environments[0]));
        },
    ];
    for (const mutate of mutations) {
        const p = createPlan();
        mutate(p);
        assert.throws(() => check(p, fixture()), /logical plan/);
    }
});

test("reject branch allocation substitutions and unexpected fields", () => {
    const approved = fixture();
    for (const mutate of [
        (a) => {
            a["pilot-a"].d1 = "production-pollinations-enter-db";
        },
        (a) => {
            a["pilot-a"].workers.enter = a["pilot-b"].workers.enter;
        },
        (a) => {
            a["pilot-a"].routes.gen = "gen.pollinations.ai";
        },
        (a) => {
            a["pilot-a"].services = { ENTER: "other" };
        },
        (a) => {
            delete a["pilot-b"];
        },
    ]) {
        const proposed = copy(approved);
        mutate(proposed);
        assert.throws(
            () => validate(createPlan(), proposed, approved, []),
            /differs/,
        );
    }
    const invalid = fixture();
    invalid["pilot-a"].vpc = "hidden";
    assert.throws(() => check(createPlan(), invalid), /fields/);
});

test("reject reserved, production and staging identifiers, including opaque IDs in inventory", () => {
    const a = fixture();
    assert.throws(() => check(createPlan(), a, ["a-db"]), /reserved/);
    for (const name of [
        "production-pollinations-enter-db",
        "pollinations-text-staging",
        "prod.example.invalid",
    ]) {
        const b = fixture();
        b["pilot-a"].r2 = name;
        assert.throws(() => check(createPlan(), b), /unsafe/);
    }
    assert.throws(() => validate(createPlan(), a, a), /inventory required/);
});

test("reject noncanonical identifiers and malformed routes rather than normalize them", () => {
    for (const value of [
        "",
        "A-DB",
        " a-db",
        "a-db ",
        "a\u200b-db",
        "а-db",
        "a_db",
        "a/db",
        "a..db",
        "-a",
        "a-",
        "x".repeat(254),
        null,
        123,
    ]) {
        const a = fixture();
        a["pilot-a"].d1 = value;
        assert.throws(() => check(createPlan(), a), /invalid/);
    }
    for (const value of [
        "https://enter.a.invalid",
        "*.a.invalid",
        "enter.a.invalid/*",
        "enter.a.invalid.",
        "localhost",
        `${"a".repeat(64)}.invalid`,
        "a.-b.invalid",
    ]) {
        const a = fixture();
        a["pilot-a"].routes.enter = value;
        assert.throws(() => check(createPlan(), a), /invalid/);
    }
    assert.throws(() => check(createPlan(), fixture(), [" A-DB"]), /invalid/);
});

test("reject malformed approved records and non-JSON object prototypes", () => {
    for (const value of [null, [], {}, { "pilot-a": {} }]) {
        assert.throws(() => validate(createPlan(), value, value, []), /fields/);
    }
    const a = fixture();
    a["pilot-a"].workers = Object.assign(
        Object.create(null),
        a["pilot-a"].workers,
    );
    assert.throws(() => validate(createPlan(), a, a, []), /fields/);
});
